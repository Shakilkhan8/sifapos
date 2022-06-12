odoo.define('pos_retail.ButtonGoSaleOrderScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class ButtonGoSaleOrderScreen extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        mounted() {
            posbus.on('save-sale-order', this, this.render);
        }

        willUnmount() {
            posbus.off('save-sale-order', this);
        }

        get getCount() {
            return this.env.pos.booking_ids.length;
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            var self = this;
            const {confirmed, payload: nul} = await this.showTempScreen(
                'SaleOrderList',
                {
                    order: null,
                    selectedClient: null
                }
            );
            if (confirmed) {
                debugger
            }
        }
    }

    ButtonGoSaleOrderScreen.template = 'ButtonGoSaleOrderScreen';

    ProductScreen.addControlButton({
        component: ButtonGoSaleOrderScreen,
        condition: function () {
            return this.env.pos.config.booking_orders;
        },
    });

    Registries.Component.add(ButtonGoSaleOrderScreen);

    return ButtonGoSaleOrderScreen;
});
