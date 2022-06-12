odoo.define('pos_retail.ButtonSetBundlePack', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetBundlePack extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        mounted() {
            this.env.pos.get_order().orderlines.on('change', () => {
                this.render();
            });
        }

        get isHighlighted() {
            var order = this.env.pos.get_order();
            if (order && order.get_selected_orderline()) {
                let selectedLine = order.get_selected_orderline();
                let combo_items = this.env.pos.combo_items.filter((c) => selectedLine.product.product_tmpl_id == c.product_combo_id[0])
                if (combo_items.length) {
                    return true
                }
            }
            return false
        }

        async onClick() {
            let order = this.env.pos.get_order();
            let selectedLine = order.get_selected_orderline();
            if (selectedLine) {
                let combo_items = this.env.pos.combo_items.filter((c) => selectedLine.product.product_tmpl_id == c.product_combo_id[0])
                if (combo_items.length == 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: selectedLine.product.display_name + this.env._t(' it not Bundle Pack')
                    })
                } else {
                    if (!selectedLine.combo_items) {
                        selectedLine.combo_items = [];
                    }
                    let selectedComboItems = selectedLine.combo_items.map((c) => c.id)
                    combo_items.forEach(function (c) {
                        if (selectedComboItems.indexOf(c.id) != -1) {
                            c.selected = true
                        } else {
                            c.selected = false;
                        }
                        c.display_name = c.product_id[1];
                    })
                    let {confirmed, payload: result} = await this.showPopup('PopUpMultiChoice', {
                        title: this.env._t('Select Bundle/Pack Items'),
                        items: combo_items
                    })
                    if (confirmed) {
                        if (result.items.length) {
                            selectedLine.set_combo_bundle_pack(result.items);
                        } else {
                            selectedLine.set_combo_bundle_pack([]);
                        }
                    }
                }

            } else {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Please selected 1 line')
                })
            }

        }
    }

    ButtonSetBundlePack.template = 'ButtonSetBundlePack';

    ProductScreen.addControlButton({
        component: ButtonSetBundlePack,
        condition: function () {
            return this.env.pos.combo_items.length != 0;
        },
    });

    Registries.Component.add(ButtonSetBundlePack);

    return ButtonSetBundlePack;
});
