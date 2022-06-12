odoo.define('pos_retail.ButtonGoInvoiceScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class ButtonGoInvoiceScreen extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        mounted() {
            posbus.on('save-account-move', this, this.render);
        }

        willUnmount() {
            posbus.off('save-account-move', this);
        }

        get getCount() {
            return this.env.pos.invoice_ids.length;
        }

        async onClick() {
            var self = this;
            const {confirmed, payload: nul} = await this.showTempScreen(
                'AccountMoveScreen',
                {
                    move: null,
                }
            );
            if (confirmed) {
                debugger
            }
        }
    }

    ButtonGoInvoiceScreen.template = 'ButtonGoInvoiceScreen';

    ProductScreen.addControlButton({
        component: ButtonGoInvoiceScreen,
        condition: function () {
            return this.env.pos.config.management_invoice;
        },
    });

    Registries.Component.add(ButtonGoInvoiceScreen);

    return ButtonGoInvoiceScreen;
});
