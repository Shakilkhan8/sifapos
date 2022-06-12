odoo.define('pos_retail.ButtonSuggestBuyProducts', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSuggestBuyProducts extends PosComponent {
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
            if (selectedLine.product.cross_selling && this.env.pos.cross_items_by_product_tmpl_id[selectedLine.product.product_tmpl_id]) {
                return true
            } else {
                return false
            }
        }

        async onClick() {
            let selectedOrder = this.env.pos.get_order();
            if (!selectedOrder.get_selected_orderline()) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('This feature only active with Products has setup Cross Selling')
                })
            }
            let selectedLine = this.env.pos.get_order().get_selected_orderline();
            let product = selectedLine.product;
            let crossItems = this.env.pos.cross_items_by_product_tmpl_id[product.product_tmpl_id];
            if (!crossItems || crossItems.length == 0) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: product.display_name + this.env._t(' not active feature Cross Selling, please go to Product active it')
                })
            }
            let {confirmed, payload: results} = await this.showPopup('PopUpMultiChoice', {
                title: this.env._t('Suggest buy more Products with ' + product.display_name),
                items: crossItems
            })
            if (confirmed) {
                let selectedOrder = this.env.pos.get_order();
                let selectedCrossItems = results.items;
                for (let index in selectedCrossItems) {
                    let item = selectedCrossItems[index];
                    let product = this.env.pos.db.get_product_by_id(item['product_id'][0]);
                    if (product) {
                        if (!product) {
                            continue
                        }
                        var price = item['list_price'];
                        var discount = 0;
                        if (item['discount_type'] == 'fixed') {
                            price = price - item['discount']
                        }
                        if (item['discount_type'] == 'percent') {
                            discount = item['discount']
                        }
                        selectedOrder.add_product(product, {
                            quantity: item['quantity'],
                            price: price,
                            merge: false,
                        });
                        if (discount > 0) {
                            selectedOrder.get_selected_orderline().set_discount(discount)
                        }
                    }
                }
            }
        }
    }

    ButtonSuggestBuyProducts.template = 'ButtonSuggestBuyProducts';

    ProductScreen.addControlButton({
        component: ButtonSuggestBuyProducts,
        condition: function () {
            return this.env.pos.cross_items && this.env.pos.cross_items.length > 0;
        },
    });

    Registries.Component.add(ButtonSuggestBuyProducts);

    return ButtonSuggestBuyProducts;
});
