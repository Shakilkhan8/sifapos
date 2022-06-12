odoo.define('pos_retail.OrderReceiptHeader', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class OrderReceiptHeader extends PosComponent {
        constructor() {
            super(...arguments);
            this.order = this.env.pos.get_order();
            this.client = this.order.get_client();
        }
        // willUpdateProps(nextProps) {
        //     this._receiptEnv = nextProps.order.getOrderReceiptEnv();
        // }
        // get receipt() {
        //     return this.receiptEnv.receipt;
        // }
        // get orderlines() {
        //     return this.receiptEnv.orderlines;
        // }
        // get order() {
        //     return this.env.pos.get_order()
        // }
        // get paymentlines() {
        //     return this.receiptEnv.paymentlines;
        // }
        // get isTaxIncluded() {
        //     return Math.abs(this.receipt.subtotal - this.receipt.total_with_tax) <= 0.000001;
        // }
        // get receiptEnv () {
        //   return this._receiptEnv;
        // }

    }

    OrderReceiptHeader.template = 'OrderReceiptHeader';

    Registries.Component.add(OrderReceiptHeader);

    return OrderReceiptHeader;
});
