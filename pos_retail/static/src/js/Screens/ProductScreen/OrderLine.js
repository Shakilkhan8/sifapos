odoo.define('pos_retail.Orderline', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Orderline = require('point_of_sale.Orderline');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const RetailOrderline = (Orderline) =>
        class extends Orderline {
            constructor() {
                super(...arguments);
            }

            get getDiscountExtra() {
                return this.props.line.discount_extra
            }

            get getPriceExtra() {
                return this.props.line.price_extra
            }

            sendInput(input) {
                const self = this;
                setTimeout(function () {
                    const selectedOrder = self.env.pos.get_order()
                    if (selectedOrder) {
                        const selectedLine = selectedOrder.get_selected_orderline()
                        if (selectedLine) {
                            if (input == '+') {
                                selectedLine.set_quantity(selectedLine.quantity + 1)
                            }
                            if (input == '-') {
                                selectedLine.set_quantity(selectedLine.quantity - 1)
                            }
                            if (input == 'delete') {
                                selectedOrder.remove_orderline(selectedLine);
                            }
                        }
                    }
                }, 50) // need timeout 1/2 second for POS switch selected line
            }
        }
    Registries.Component.extend(Orderline, RetailOrderline);

    return RetailOrderline;
});
