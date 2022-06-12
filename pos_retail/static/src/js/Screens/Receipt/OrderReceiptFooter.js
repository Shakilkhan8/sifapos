odoo.define('pos_retail.OrderReceiptFooter', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class OrderReceiptFooter extends PosComponent {
        constructor() {
            super(...arguments);
            this.order = this.env.pos.get_order();
            this.client = this.order.get_client();
            this.receiptEnv = this.order.getOrderReceiptEnv();
        }
        get paymentlines() {
            return this.receiptEnv.paymentlines;
        }
        get orderlines() {
            return this.receiptEnv.orderlines;
        }
    }

    OrderReceiptFooter.template = 'OrderReceiptFooter';

    Registries.Component.add(OrderReceiptFooter);

    return OrderReceiptFooter;
});
