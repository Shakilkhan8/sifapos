odoo.define('pos_retail.ButtonCreateSaleOrder', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {Printer} = require('point_of_sale.Printer');
    const core = require('web.core');
    const _t = core._t;

    class ButtonCreateSaleOrder extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
            this._currentOrder = this.env.pos.get_order();
            this._currentOrder.orderlines.on('change', this.render, this);
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
        }

        willUnmount() {
            this._currentOrder.orderlines.off('change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get isHighlighted() {
            var order = this.env.pos.get_order();
            if (order.is_return) {
                return false;
            }
            if (order.get_client()) {
                return true
            } else {
                return false
            }
        }

        async onClick() {
            var self = this;
            let order = this.env.pos.get_order();
            if (order.get_total_with_tax() <= 0 || order.orderlines.models.length == 0) {
                return this.showPopup('ErrorPopup', {
                    title: _t('Error'),
                    body: _t('Your shopping cart is empty, and required Amount Total bigger than 0'),
                })
            }
            if (!order.get_client()) {
                this.env.pos.alert_message({
                    title: _t('Alert'),
                    body: _t('Required choice one Customer')
                })
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    order.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: _t('Alert'),
                        body: _t('Required choice Customer')
                    })
                }
            }
            const {confirmed, payload: values} = await this.showPopup('PopUpCreateSaleOrder', {
                title: this.env._t('Create Sale (Quotation) Order'),
                order: order,
                delivery_date : new Date().toISOString(),
                sale_order_auto_confirm: this.env.pos.config.sale_order_auto_confirm,
                sale_order_auto_invoice: this.env.pos.config.sale_order_auto_invoice,
                sale_order_auto_delivery: this.env.pos.config.sale_order_auto_delivery,
            })
            if (confirmed) {
                if (values.error) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t(values.error)
                    })
                }
                const so_val = order.export_as_JSON();
                const popupValue = values.values
                var value = {
                    name: order.name,
                    note: popupValue.note,
                    origin: this.env.pos.config.name,
                    partner_id: order.get_client().id,
                    pricelist_id: popupValue.pricelist_id,
                    order_line: [],
                    signature: popupValue.signature,
                    book_order: true,
                    ean13: order.ean13,
                    delivery_address: popupValue.delivery_address,
                    delivery_phone: popupValue.delivery_phone,
                    delivery_date: moment(popupValue.delivery_date).format('YYYY-MM-DD hh:mm'),
                    payment_partial_amount: popupValue.payment_partial_amount,
                    payment_partial_method_id: popupValue.payment_partial_method_id,
                    pos_config_id: this.env.pos.config.id,
                }
                for (var i = 0; i < so_val.lines.length; i++) {
                    var line = so_val.lines[i][2];
                    var line_val = order._covert_pos_line_to_sale_line(line);
                    value.order_line.push(line_val);
                }
                let result = await this.rpc({
                    model: 'sale.order',
                    method: 'pos_create_sale_order',
                    args: [value, popupValue.sale_order_auto_confirm, popupValue.sale_order_auto_invoice, popupValue.sale_order_auto_delivery]
                }).then(function (response) {
                    return response
                }, function (err) {
                    return self.env.pos.query_backend_fail(err);
                })
                order._final_and_print_booking_order(result);
                this.showScreen('ReceiptScreen');
            }
        }
    }

    ButtonCreateSaleOrder.template = 'ButtonCreateSaleOrder';

    ProductScreen.addControlButton({
        component: ButtonCreateSaleOrder,
        condition: function () {
            return this.env.pos.config.sale_order;
        },
    });

    Registries.Component.add(ButtonCreateSaleOrder);

    return ButtonCreateSaleOrder;
});
