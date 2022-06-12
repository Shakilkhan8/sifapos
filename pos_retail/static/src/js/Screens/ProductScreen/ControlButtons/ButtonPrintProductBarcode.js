odoo.define('pos_retail.ButtonPrintProductBarcode', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonPrintProductBarcode extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
            return this.env.pos.printBarcode
        }

        async onClick() {
            this.env.pos.printBarcode = !this.env.pos.printBarcode;
            if (this.env.pos.printBarcode) {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t('You can search and click to any Product for print Barcode Label of Product')
                })
            } else {
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t('Now is normal mode, you can add products to cart')
                })
            }
        }
    }

    ButtonPrintProductBarcode.template = 'ButtonPrintProductBarcode';

    ProductScreen.addControlButton({
        component: ButtonPrintProductBarcode,
        condition: function () {
            return this.env.pos.config.product_operation;
        },
    });

    Registries.Component.add(ButtonPrintProductBarcode);

    return ButtonPrintProductBarcode;
});
