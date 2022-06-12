odoo.define('pos_retail.AbstractReceiptScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const AbstractReceiptScreen = require('point_of_sale.AbstractReceiptScreen');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const RetailAbstractReceiptScreen = (AbstractReceiptScreen) =>
        class extends AbstractReceiptScreen {
            constructor() {
                super(...arguments);
            }

            async _printReceipt() {
                if (this.env.pos.config.proxy_ip && this.env.pos.config.iface_print_via_proxy) {
                    console.log('POSBOX proxy setup succeed. Auto print direct POSBOX')
                    if (this.env.pos.reportXML) {
                        const printResult = await this.env.pos.proxy.printer.print_receipt(this.env.pos.reportXML);
                        if (printResult.successful) {
                            return true;
                        }
                    } else {
                        // const {confirmed} = await this.showPopup('ConfirmPopup', {
                        //     title: this.env._t('Sorry'),
                        //     body: this.env._t('This report not ready format XML for print. Contact author of direct email: thanhchatvn@gmail.com. Click Ok for print direct your Web browse !'),
                        // });
                        // if (confirmed) {
                        //     return this._printWeb()
                        // } else {
                        //     return true
                        // }
                        return super._printReceipt()
                    }
                    this.env.pos.reportXML = null;
                    return true
                }
                if (!this.orderReceipt.el.outerHTML) {
                    return await this._printWeb();
                } else {
                    return super._printReceipt()
                }
            }
        }
    Registries.Component.extend(AbstractReceiptScreen, RetailAbstractReceiptScreen);

    return RetailAbstractReceiptScreen;
});
