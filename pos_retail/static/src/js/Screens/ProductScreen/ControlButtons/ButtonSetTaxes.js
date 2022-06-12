odoo.define('pos_retail.ButtonSetTaxes', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetTaxes extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
            this._currentOrder = this.env.pos.get_order();
            this._currentOrder.orderlines.on('change', this.render, this);
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
        }

        willUnmount() {
            this._currentOrder.orderlines.off('change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get isHighlighted() {
            var order = this.env.pos.get_order();
            if (order.is_return) {
                return false;
            }
            const selectedLine = order.get_selected_orderline()
            if (!selectedLine || selectedLine.is_return) {
                return false
            } else {
                return true
            }
        }

        get getTaxesApplied() {
            let order = this.env.pos.get_order();
            let selectedLine = order.get_selected_orderline();
            if (!selectedLine || this.env.pos.taxes.length == 0) {
                return this.env._t('Set Taxes')
            } else {
                let taxes_id = selectedLine.product.taxes_id;
                let buttonString = this.env._t('Taxes Included: ')
                let taxes = []
                let update_tax_ids = this.env.pos.config.update_tax_ids || [];
                this.env.pos.taxes.forEach(function (t) {
                    if (update_tax_ids.indexOf(t.id) != -1) {
                        if (taxes_id.indexOf(t.id) != -1) {
                            taxes.push(t)
                        }

                    }
                })
                if (taxes.length) {
                    for (let i = 0; i < taxes.length; i++) {
                        let tax = taxes[i]
                        buttonString += tax.amount
                        if (i < (taxes.length - 1)) {
                            buttonString += ','
                        }
                    }
                } else {
                    buttonString += this.env._t(' Nothing ')
                }
                return buttonString
            }
        }

        async onClick() {
            let order = this.env.pos.get_order();
            let selectedLine = order.get_selected_orderline();
            if (selectedLine.is_return || order.is_return) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('it not possible set taxes on Order return')
                })
            }
            if (selectedLine) {
                let taxes_id = selectedLine.product.taxes_id;
                let taxes = [];
                let update_tax_ids = this.env.pos.config.update_tax_ids || [];
                this.env.pos.taxes.forEach(function (t) {
                    if (update_tax_ids.indexOf(t.id) != -1) {
                        if (taxes_id.indexOf(t.id) != -1) {
                            t.selected = true
                        }
                        taxes.push(t)
                    }
                })
                if (taxes.length) {
                    let {confirmed, payload: result} = await this.showPopup('PopUpMultiChoice', {
                        title: this.env._t('Select Taxes need to apply'),
                        items: taxes
                    })
                    let tax_ids = []
                    if (confirmed) {
                        if (result.items.length) {
                            tax_ids = result.items.filter((i) => i.selected).map((i) => i.id)
                        }
                    }
                    order.get_selected_orderline().set_taxes(tax_ids);
                }
            } else {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Please selected 1 line for set taxes')
                })
            }

        }

        get serviceAdded() {
            var order = this.env.pos.get_order();
            var serviceLine = _.find(order.orderlines.models, function (l) {
                return l.service_id != null
            })
            if (serviceLine) {
                return serviceLine.product.display_name;
            } else {
                return this.env._t('Service')
            }
        }
    }

    ButtonSetTaxes.template = 'ButtonSetTaxes';

    ProductScreen.addControlButton({
        component: ButtonSetTaxes,
        condition: function () {
            return this.env.pos.config.update_tax_ids.length;
        },
    });

    Registries.Component.add(ButtonSetTaxes);

    return ButtonSetTaxes;
});
