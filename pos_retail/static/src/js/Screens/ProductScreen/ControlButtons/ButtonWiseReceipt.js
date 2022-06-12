odoo.define('pos_retail.ButtonWiseReceipt', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonWiseReceipt extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }
        get isHighlighted() {
            return this.env.pos.config.category_wise_receipt
        }

        get wiseReceipt() {
            if (this.env.pos.config.category_wise_receipt) {
                return this.env._t('Wise On')
            } else {
                return this.env._t('Wise Off')
            }

        }
        async onClick() {
            let isOff = 'Off'
            let isOn = 'On'
            if (!this.env.pos.config.category_wise_receipt) {
                isOn = 'Off'
                isOff = 'On'
            }
            let confirmed = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Alert'),
                body: this.env._t('Receipt Wise by Product Category still : ' + isOn + ' .Are you want turn it : ' + isOff)
            })
            if (confirmed) {
                this.env.pos.config.category_wise_receipt = !this.env.pos.config.category_wise_receipt
                this.render()
            }

        }
    }

    ButtonWiseReceipt.template = 'ButtonWiseReceipt';

    ProductScreen.addControlButton({
        component: ButtonWiseReceipt,
        condition: function () {
            return true;
        },
    });

    Registries.Component.add(ButtonWiseReceipt);

    return ButtonWiseReceipt;
});
