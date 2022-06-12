odoo.define('pos_retail.OrderReceipt', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const OrderReceipt = require('point_of_sale.OrderReceipt');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const RetailOrderReceipt = (OrderReceipt) =>
        class extends OrderReceipt {
            constructor() {
                super(...arguments);
                this._receiptEnv = this.env.pos.getReceiptEnv();
                console.log('call direct getReceiptEnv()');
            }

            willUpdateProps(nextProps) {
                if (nextProps.order) { // restaurant has error when back to floor sreeen, order is null and nextProps.order is not found
                    super.willUpdateProps(nextProps)
                } else {
                    this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('Your POS active iface_print_skip_screen, please turn it off. This feature make lose order')
                    })
                }
            }
        }

    Registries.Component.extend(OrderReceipt, RetailOrderReceipt);
    OrderReceipt.template = 'RetailOrderReceipt';
    Registries.Component.add(RetailOrderReceipt);



    return OrderReceipt;
});

