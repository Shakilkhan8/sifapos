odoo.define('pos_retail.ButtonEditVariants', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonEditVariants extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        mounted() {
            this.env.pos.get('orders').on('add remove change', () => this.render(), this);
            this.env.pos.on('change:selectedOrder', () => this.render(), this);
            this.env.pos.get_order().orderlines.on('change', () => {
                this.render();
            });
        }

        willUnmount() {
            this.env.pos.get('orders').off('add remove change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get isHighlighted() {
            let selectedOrder = this.env.pos.get_order();
            if (!selectedOrder || !selectedOrder.get_selected_orderline()) {
                return false
            }
            let selectedLine = this.env.pos.get_order().get_selected_orderline();
            if (selectedLine.product.multi_variant && this.env.pos.variant_by_product_tmpl_id[selectedLine.product.product_tmpl_id]) {
                return true
            } else {
                return false
            }
        }

        async onClick() {
            let selectedOrder = this.env.pos.get_order();
            let selectedLine = selectedOrder.get_selected_orderline();
            let product = selectedLine.product;
            let variants = this.env.pos.variant_by_product_tmpl_id[product.product_tmpl_id];
            if (!variants) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: product.display_name + this.env._t(' have not ative multi variant')
                })
            }
            let variantsSelectedIds = []
            if (selectedLine.variants) {
                variantsSelectedIds = selectedLine.variants.map((v) => (v.id))
            }
            variants.forEach(function (v) {
                if (variantsSelectedIds.indexOf(v.id) != -1) {
                    v.selected = true
                } else {
                    v.selected = false;
                }
            })

            let {confirmed, payload: results} = await this.showPopup('PopUpMultiChoice', {
                title: this.env._t('Select Variants and Values'),
                items: variants
            })
            if (confirmed) {
                let variantIds = results.items.map((i) => (i.id))
                selectedLine.set_variants(variantIds);
            }
        }
    }

    ButtonEditVariants.template = 'ButtonEditVariants';

    ProductScreen.addControlButton({
        component: ButtonEditVariants,
        condition: function () {
            return this.env.pos.variants && this.env.pos.variants.length > 0;
        },
    });

    Registries.Component.add(ButtonEditVariants);

    return ButtonEditVariants;
});
