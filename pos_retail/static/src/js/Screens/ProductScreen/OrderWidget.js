odoo.define('pos_retail.OrderWidget', function (require) {
        'use strict';

        const PosComponent = require('point_of_sale.PosComponent');
        const OrderWidget = require('point_of_sale.OrderWidget');
        const {useState} = owl.hooks;
        const {useListener} = require('web.custom_hooks');
        const models = require('point_of_sale.models');
        const Registries = require('point_of_sale.Registries');

        const RetailOrderWidget = (OrderWidget) =>
            class extends OrderWidget {
                constructor() {
                    super(...arguments);
                }

                async _editPackLotLines(event) {
                    let self = this;
                    const orderline = event.detail.orderline;
                    const isAllowOnlyOneLot = orderline.product.isAllowOnlyOneLot();
                    const packLotLinesToEdit = orderline.getPackLotLinesToEdit(isAllowOnlyOneLot);
                    if (packLotLinesToEdit.length == 1 && packLotLinesToEdit[0].text == "" && this.env.pos.config.fullfill_lots && ['serial', 'lot'].includes(orderline.product.tracking)) {
                        let packLotLinesToEdit = await this.rpc({
                            model: 'stock.production.lot',
                            method: 'search_read',
                            domain: [['product_id', '=', orderline.product.id]],
                            fields: ['name', 'id']
                        }).then(function (lots) {
                            return lots
                        }, function (error) {
                            return self.env.pos.query_backend_fail(error)
                        })
                        let newPackLotLinesToEdit = packLotLinesToEdit.map((lot) => ({text: lot.name}));
                        const {confirmed, payload} = await this.showPopup('EditListPopup', {
                            title: this.env._t('Selection only 1 Lot/Serial Number(s). It a required'),
                            isSingleItem: isAllowOnlyOneLot,
                            array: newPackLotLinesToEdit,
                        });
                        if (confirmed) {
                            const modifiedPackLotLines = Object.fromEntries(
                                payload.newArray.filter(item => item.id).map(item => [item.id, item.text])
                            );
                            const newPackLotLines = payload.newArray
                                .filter(item => !item.id)
                                .map(item => ({lot_name: item.text}));
                            if (newPackLotLines.length == 1) {
                                orderline.setPackLotLines({modifiedPackLotLines, newPackLotLines});
                            } else {
                                return this.showPopup('ErrorPopup', {
                                    title: this.env._t('Warning'),
                                    body: this.env._t('Please select only one Lot/Serial')
                                })
                            }
                        }
                        this.order.select_orderline(event.detail.orderline);
                    } else {
                        super._editPackLotLines(event)
                    }
                }

                _updateSummary() {
                    if (this.order && this.order.get_client() && this.env.pos.loyalty) {
                        let points = this.order.get_client_point();
                        let plus_point = points['plus_point'];
                        this.order.plus_point = plus_point;
                        this.order.redeem_point = points['redeem_point'];
                        this.order.remaining_point = points['remaining_point'];
                    }
                    super._updateSummary();
                    this.env.pos.trigger('orderWidget.updated')
                }
            }

        Registries
            .Component
            .extend(OrderWidget, RetailOrderWidget);

        return
        RetailOrderWidget;
    }
);
