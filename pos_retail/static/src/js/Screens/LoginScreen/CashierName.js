odoo.define('pos_retail.HrCashierName', function (require) {
    'use strict';

    const CashierName = require('pos_hr.CashierName');
    const Registries = require('point_of_sale.Registries');

    const RetailCashierName = (CashierName) =>
        class extends CashierName {
            async selectCashier() {
                if (this.env.pos.config.module_pos_hr && this.env.pos.config.multi_session) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('Your POS Actived Multi Session, Please click Lock Button on in the end of Right Header for logout your Session')
                    })
                }
                super.selectCashier()
            }
        }
    Registries.Component.extend(CashierName, RetailCashierName);

    return RetailCashierName;
});
