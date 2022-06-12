odoo.define('pos_retail.CashierName', function (require) {
    'use strict';

    const CashierName = require('point_of_sale.CashierName');
    const Registries = require('point_of_sale.Registries');

    const RetailCashierName = (CashierName) =>
        class extends CashierName {
            constructor() {
                super(...arguments);
            }
        }
    Registries.Component.extend(CashierName, RetailCashierName);

    return RetailCashierName;
});
