odoo.define('pos_retail.RetailTableWidget', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductsWidget = require('point_of_sale.ProductsWidget');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const TableWidget = require('pos_restaurant.TableWidget');
    const Registries = require('point_of_sale.Registries');

    const RetailTableWidget = (TableWidget) =>
        class extends TableWidget {
            get getCountItemsWaitingDelivery() {
                var count = 0;
                const orders = this.env.pos.get_table_orders(this.props.table);
                for (let i = 0; i < orders.length; i++) {
                    let order = orders[i];
                    let receiptOrders = this.env.pos.db.getOrderReceiptByUid(order.uid);
                    for (let j = 0; j < receiptOrders.length; j++) {
                        let receiptOrder = receiptOrders[j];
                        let linesReadyTransfer = receiptOrder.new.filter(n => n.state == 'Ready Transfer' || n.state == 'Kitchen Requesting Cancel')
                        count += linesReadyTransfer.length
                    }
                }
                return count
            }
        }
    Registries.Component.extend(TableWidget, RetailTableWidget);

    return RetailTableWidget
});
