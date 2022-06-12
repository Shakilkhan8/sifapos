odoo.define('pos_retail.ButtonGoPosOrderScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonGoPosOrderScreen extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get getCount() {
            return this.env.pos.db.orders_count;
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            var self = this;
            this.showScreen(
                'PosOrderScreen',
                {
                    order: this.env.pos.get_order(),
                    selectedClient: this.env.pos.get_order().get_client()
                }
            );
        }
    }

    ButtonGoPosOrderScreen.template = 'ButtonGoPosOrderScreen';

    ProductScreen.addControlButton({
        component: ButtonGoPosOrderScreen,
        condition: function () {
            return this.env.pos.config.pos_orders_management;
        },
    });

    Registries.Component.add(ButtonGoPosOrderScreen);

    return ButtonGoPosOrderScreen;
});
