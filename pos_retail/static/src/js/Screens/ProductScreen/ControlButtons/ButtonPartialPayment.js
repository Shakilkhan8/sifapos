odoo.define('pos_retail.ButtonPartialPayment', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonPartialPayment extends PosComponent {
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
            if (!selectedOrder.get_client()) {
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    selectedOrder.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: _this.env._t('Required choice Customer')
                    })
                }
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
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t('Register Amount: Please input Amount (Money) Customer register one part of Amount Total Order'),
                    startingValue: 0
                })
                if (confirmed) {
                    number = parseFloat(number)
                    if (number <= 0 || number > selectedOrder.get_total_with_tax()) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: this.env._t('Register Amount required bigger than 0 and smaller than total amount of Order')
                        })
                    }
                    let paymentLines = selectedOrder.paymentlines.models
                    paymentLines.forEach(function (p) {
                        selectedOrder.remove_paymentline(p)
                    })
                    selectedOrder.add_paymentline(paymentMethod);
                    let paymentline = selectedOrder.selected_paymentline;
                    paymentline.set_amount(number);
                    selectedOrder.trigger('change', selectedOrder);
                    let order_ids = this.env.pos.push_single_order(selectedOrder, {
                        draft: true
                    })
                    console.log('{ButtonPartialPayment.js} pushed succeed order_ids: ' + order_ids)
                    return this.showScreen('ReceiptScreen');
                }
            }
        }
    }

    ButtonPartialPayment.template = 'ButtonPartialPayment';

    ProductScreen.addControlButton({
        component: ButtonPartialPayment,
        condition: function () {
            return this.env.pos.config.paid_partial;
        },
    });

    Registries.Component.add(ButtonPartialPayment);

    return ButtonPartialPayment;
});
