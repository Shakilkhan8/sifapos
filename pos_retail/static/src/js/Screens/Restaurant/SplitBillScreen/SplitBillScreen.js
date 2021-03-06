odoo.define('pos_retail.SplitBillScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const SplitBillScreen = require('pos_restaurant.SplitBillScreen');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    const RetailSplitBillScreen = (SplitBillScreen) =>
        class extends SplitBillScreen {
            constructor() {
                super(...arguments);
            }

            async doTransferTable() {
                var oldOrder = this.currentOrder;
                let lists = this.env.pos.tables.filter((t) => t.id != oldOrder.table.id).map((t) => ({
                    id: t.id,
                    item: t,
                    label: t.floor.name + ' / ' + t.name
                }))
                let {confirmed, payload: table} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Alert, please select table need moving Lines just selected'),
                    list: lists
                })
                if (confirmed) {
                    if (_.isEmpty(this.splitlines))
                        // Splitlines is empty
                        return;
                    this._isFinal = true;
                    this.transferLines(table)
                    delete this.newOrder.temporary;
                }
            }

            getTableOrdered(table_id) {
                var orders = this.env.pos.get('orders').models
                for (var i = 0; i < orders.length; i++) {
                    var order = orders[i];
                    if (order.table && order.table.id == table_id) {
                        return order
                    }
                }
                return null;
            }

            async transferLines(table) {
                // todo: currentOrder (1) has selected split, newOrder is split from (1), toOrder: is order transfer clone lines selected
                // case 1: line has send receipt to kitchen ==> auto set selectedOrder to saveChanges()
                // case 2: line not send to kitchen
                var oldOrder = this.currentOrder;
                var ordered = this.getTableOrdered(table.id);
                let lineMoves = [];
                for (let id in this.splitlines) {
                    if (this.splitlines[id].quantity > 0) {
                        lineMoves.push(this.splitlines[id])
                    }
                }
                if (lineMoves.length == 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Please select minimum 1 line of Order Lines')
                    })
                }
                let toOrder = null;
                if (ordered == null) {
                    toOrder = new models.Order({}, {
                        pos: this.env.pos,
                    });
                    toOrder.table = table;
                    this.env.pos.get('orders').add(toOrder);
                } else {
                    toOrder = ordered;
                }
                for (let line_id in this.splitlines) {
                    let liveMove = this.newOrderLines[line_id];
                    let qtyMove = this.splitlines[line_id].quantity;
                    if (this.splitlines[line_id].quantity > 0) {
                        let newLine = liveMove.clone();
                        toOrder.add_orderline(newLine);
                        newLine.set_quantity(qtyMove)
                        let lineWillUpdate = oldOrder.get_orderline(parseInt(line_id));
                        if (lineWillUpdate.quantity == qtyMove) {
                            oldOrder.remove_orderline(lineWillUpdate);
                        } else {
                            lineWillUpdate.set_quantity(lineWillUpdate.quantity - qtyMove, 'do not recompute unit price')
                        }
                        newLine.mp_dirty = lineWillUpdate.mp_dirty
                        newLine.mp_skip = lineWillUpdate.mp_skip
                        // Case 1: saveChanges if line transfer done send receipt to kitchen
                        if (!newLine.mp_dirty) {
                            toOrder.saveChanges()
                        }
                        newLine.trigger('change', newLine);
                    }
                }
                toOrder.trigger('change', toOrder);
                toOrder.set_screen_data({name: 'ProductScreen'});
                posbus.trigger('table-set');
                if (toOrder.hasChangesToPrint()) {
                    const isPrintSuccessful = await toOrder.printChanges();
                    if (isPrintSuccessful) {
                        toOrder.saveChanges();
                    }
                }
                oldOrder.set_screen_data({name: 'ProductScreen'});
                if (oldOrder.orderlines.length == 0) {
                    oldOrder.finalize()
                }
                this.env.pos.set('selectedOrder', toOrder);
            }

        }
    Registries.Component.extend(SplitBillScreen, RetailSplitBillScreen);

    return RetailSplitBillScreen;
});
