odoo.define('pos_retail.SubmitOrderButton', function (require) {
    'use strict';

    const SubmitOrderButton = require('pos_restaurant.SubmitOrderButton');
    const Registries = require('point_of_sale.Registries');
    var core = require('web.core');
    var QWeb = core.qweb;

    const RetailSubmitOrderButton = (SubmitOrderButton) =>
        class extends SubmitOrderButton {
            constructor() {
                super(...arguments);
                const self = this;
                setTimeout(function () {
                    self.autoSubmitOrderToKitchen()
                }, 500)
            }

            async autoSubmitOrderToKitchen() {
                // const selectedOrder = this.env.pos.get_order() // kimanh
                // if (selectedOrder && this.env.pos.tables && this.env.pos.config.auto_order) {
                //     try {
                //         if (selectedOrder && selectedOrder.hasChangesToPrint()) {
                //             const isPrintSuccessful = await selectedOrder.printChanges();
                //             if (isPrintSuccessful) {
                //                 selectedOrder.saveChanges();
                //             } else {
                //                 console.log('Printer not found')
                //                 selectedOrder.saveChanges();
                //             }
                //         }
                //     } catch (ex) {
                //         console.error(ex)
                //     }
                // }
                $(this.el).click()
            }

            printDirectWeb() {
                var printers = this.env.pos.printers;
                const selectedOrder = this.env.pos.get_order()
                for (var i = 0; i < printers.length; i++) {
                    var changes = selectedOrder.computeChanges(printers[i].config.product_categories_ids);
                    if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                        var receipt = QWeb.render('OrderChangeReceipt', {changes: changes, widget: selectedOrder});
                        this.showScreen('ReportScreen', {
                            report_html: receipt
                        });
                    }
                }
                return true;
            }

            async onClick() {
                const order = this.env.pos.get_order();
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.send_order_to_kitchen) {
                    this.printDirectWeb()
                    order.saveChanges();
                } else {
                    return super.onClick()
                }
            }


            get countItemsNeedPrint() {
                let selectedOrder = this.env.pos.get_order();
                if (!selectedOrder) {
                    return 0
                }
                let countItemsNeedToPrint = 0
                var printers = this.env.pos.printers;
                for (var i = 0; i < printers.length; i++) {
                    var changes = selectedOrder.computeChanges(printers[i].config.product_categories_ids);
                    if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                        countItemsNeedToPrint += changes['new'].length
                        countItemsNeedToPrint += changes['cancelled'].length
                    }
                }
                return countItemsNeedToPrint
            }
        }
    Registries.Component.extend(SubmitOrderButton, RetailSubmitOrderButton);

    return RetailSubmitOrderButton;
});