odoo.define('pos_retail.ButtonMergeTable', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonMergeTable extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        mounted() {
            this.env.pos.get('orders').on('add remove change', () => this.render(), this);
            this.env.pos.on('change:selectedOrder', () => this.render(), this);
        }
        willUnmount() {
            this.env.pos.get('orders').off('add remove change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get isHighlighted() {
            let orders = this.env.pos.get('orders');
            if (orders.length > 1) return true
            else return false
        }

        async onClick() {
            // TODO: we have 2 case and dont know how to do
            // case 1: line has send receipt to kitchen ==> auto set selectedOrder to saveChanges()
            // case 2: line not send to kitchen

            let selectedOrder = this.env.pos.get('selectedOrder');
            // Case 1: first need send all request to kitchen
            if (selectedOrder.hasChangesToPrint()) {
                const isPrintSuccessful = await selectedOrder.printChanges();
                if (isPrintSuccessful) {
                    selectedOrder.saveChanges();
                }
            }

            let orders = this.env.pos.get('orders');
            let ordersAllowMerge = orders.filter((o) => o.uid != selectedOrder.uid).map((o) => ({
                id: o.uid,
                item: o,
                label: o.table.floor.name + ' / ' + o.table.name + ': ' + o.name
            }))
            let {confirmed, payload: order} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Please select one Table merge to current Order'),
                list: ordersAllowMerge
            })
            if (confirmed) {
                for (let index in order.orderlines.models) {
                    let lineTransfer = order.orderlines.models[index]
                    let newLine = lineTransfer.clone();
                    selectedOrder.add_orderline(newLine);
                    // todo (kimanh): what next we can do now ? keep last send to kitchen or renew ???
                    newLine.mp_dirty = lineTransfer.mp_dirty
                    newLine.mp_skip = lineTransfer.mp_skip
                    // Case 1: saveChanges if line transfer done send receipt to kitchen
                    if (!newLine.mp_dirty) {
                        selectedOrder.saveChanges()
                    }
                    newLine.trigger('change', newLine);
                }
                // Case 2: if not send, automatic send
                if (selectedOrder.hasChangesToPrint()) {
                    const isPrintSuccessful = await selectedOrder.printChanges();
                    if (isPrintSuccessful) {
                        selectedOrder.saveChanges();
                    }
                }
                order.finalize()
            }

        }
    }

    ButtonMergeTable.template = 'ButtonMergeTable';

    ProductScreen.addControlButton({
        component: ButtonMergeTable,
        condition: function () {
            return this.env.pos.config.allow_merge_table && this.env.pos.tables && this.env.pos.tables.length;
        },
    });

    Registries.Component.add(ButtonMergeTable);

    return ButtonMergeTable;
});
