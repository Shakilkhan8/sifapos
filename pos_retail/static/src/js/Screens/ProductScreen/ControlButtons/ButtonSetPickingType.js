odoo.define('pos_retail.ButtonSetPickingType', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetPickingType extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
        }

        get currentPickingType() {
            return this.env.pos.get_picking_source_location().display_name;
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            let list = this.env.pos.stock_picking_types.filter(spt => spt.default_location_src_id != undefined)
            list = list.map(l => (
                {
                    id: l.id,
                    label: l.display_name,
                    item: l

                }
            ))
            if (list.length > 0) {
                let {confirmed, payload: pickingType} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Change Stock Operation Type of selected Order'),
                    list: list,
                })
                if (confirmed) {
                    var order = this.env.pos.get_order();
                    order.set_picking_type(pickingType.id);
                    this.setLocation(pickingType.default_location_src_id[0])
                }
            } else {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Your POS Config not setting Stock Operation Type at tab Warehourse'),
                });
            }

        }

        setLocation(location_id) {
            var self = this;
            var location = self.env.pos.stock_location_by_id[location_id];
            var order = self.env.pos.get_order();
            if (location && order) {
                order.set_picking_source_location(location);
                return self.env.pos._get_stock_on_hand_by_location_ids([], [location_id]).then(function (stock_datas_by_location_id) {
                    self.env.pos.stock_datas_by_location_id = stock_datas_by_location_id;
                    var location = self.env.pos.get_picking_source_location();
                    var datas = stock_datas_by_location_id[location.id];
                    var products = [];
                    self.env.pos.db.stock_datas = datas;
                    for (var product_id in datas) {
                        var product = self.env.pos.db.product_by_id[product_id];
                        if (product) {
                            product['qty_available'] = datas[product_id];
                            products.push(product)
                        }
                    }
                    if (products.length) {
                        console.log('{ButtonSetPickingType.js} Reload Stock on Hand each products')
                        self.env.pos.trigger('orderWidget.updated')
                    }
                    return self.showPopup('ConfirmPopup', {
                        title: self.env._t('Succeed, Product on hand each Product change to Stock Location: ') + location.display_name,
                        body: self.env._t('Delivery Order of Selected Order will set Source Location from ' + location.display_name),
                    });
                })
            } else {
                return this.showPopup('ErrorPopup', {
                    title: self.env._t('Error'),
                    body: self.env._t('Stock Location ID ' + location_id + ' not load to POS'),
                });
            }
        }
    }

    ButtonSetPickingType.template = 'ButtonSetPickingType';

    ProductScreen.addControlButton({
        component: ButtonSetPickingType,
        condition: function () {
            return this.env.pos.config.multi_stock_operation_type;
        },
    });

    Registries.Component.add(ButtonSetPickingType);

    return ButtonSetPickingType;
});
