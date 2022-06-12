odoo.define('pos_retail.ButtonQuicklyPaid', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonQuicklyPaid extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
            return true
        }

        get getCount() {
            return this.count;
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            let selectedOrder = this.env.pos.get_order();
            if (selectedOrder.get_total_with_tax() <= 0 || selectedOrder.orderlines.length == 0) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('It not possible with empty cart or Amount Total order smaller than or equal 0')
                })
            }
            let lists = this.env.pos.payment_methods.filter((p) => (p.journal && p.pos_method_type && p.pos_method_type == 'default') || (!p.journal && !p.pos_method_type)).map((p) => ({
                id: p.id,
                item: p,
                label: p.name
            }))
            let {confirmed, payload: paymentMethod} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Select one Payment Mode'),
                list: lists
            })
            if (confirmed) {
                let paymentLines = selectedOrder.paymentlines.models
                paymentLines.forEach(function (p) {
                    selectedOrder.remove_paymentline(p)
                })
                selectedOrder.add_paymentline(paymentMethod);
                var paymentline = selectedOrder.selected_paymentline;
                paymentline.set_amount(selectedOrder.get_total_with_tax());
                selectedOrder.trigger('change', selectedOrder);
                let order_ids = this.env.pos.push_single_order(selectedOrder, {})
                console.log('{ButtonQuicklyPaid.js} pushed succeed order_ids: ' + order_ids)
                return this.showScreen('ReceiptScreen');
            }
        }
    }

    ButtonQuicklyPaid.template = 'ButtonQuicklyPaid';

    ProductScreen.addControlButton({
        component: ButtonQuicklyPaid,
        condition: function () {
            return this.env.pos.config.quickly_payment_full;
        },
    });

    Registries.Component.add(ButtonQuicklyPaid);

    return ButtonQuicklyPaid;
});
