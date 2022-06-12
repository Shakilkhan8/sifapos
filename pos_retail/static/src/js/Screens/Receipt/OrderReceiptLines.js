odoo.define('pos_retail.OrderReceiptLines', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class OrderReceiptLines extends PosComponent {
        constructor() {
            super(...arguments);
            const order = this.env.pos.get_order();
            this.order = order;
            this.receiptEnv = order.getOrderReceiptEnv();
        }
        get receipt() {
            return this.receiptEnv.receipt;
        }
        get paymentlines() {
            return this.receiptEnv.paymentlines;
        }
        get orderlines() {
            return this.receiptEnv.orderlines;
        }

    }

    OrderReceiptLines.template = 'OrderReceiptLines';

    Registries.Component.add(OrderReceiptLines);

    return OrderReceiptLines;
});
