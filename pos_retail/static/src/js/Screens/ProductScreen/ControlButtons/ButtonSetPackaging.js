odoo.define('pos_retail.ButtonSetPackaging', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetPackaging extends PosComponent {
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
            if (selectedLine.product.sale_with_package && this.env.pos.packaging_by_product_id[selectedLine.product.id]) {
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
            if (!selectedLine.product.sale_with_package || !this.env.pos.packaging_by_product_id[selectedLine.product.id]) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: product.display_name + this.env._t(' not active feature Product Packaging, please go to Product active it')
                })
            }
            let product = selectedLine.product
            var packagings = this.env.pos.packaging_by_product_id[product.id];
            let packList = packagings.map((p) => ({
                id: p.id,
                item: p,
                label: p.name + this.env._t(' : have Contained quantity ') + p.qty + this.env._t(' with sale price ') + this.env.pos.format_currency(p.list_price)
            }))
            let {confirmed, payload: packSelected} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Select sale from Packaging'),
                list: packList
            })
            if (confirmed) {
                let selectedOrder = this.env.pos.get_order();
                let selectedLine = selectedOrder.get_selected_orderline();
                selectedLine.packaging = packSelected;
                selectedLine.set_quantity(packSelected.qty, 'set quantity manual via packing');
                if (packSelected.list_price > 0) {
                    selectedLine.set_unit_price(packSelected.list_price / packSelected.qty);
                }

            }
        }
    }

    ButtonSetPackaging.template = 'ButtonSetPackaging';

    ProductScreen.addControlButton({
        component: ButtonSetPackaging,
        condition: function () {
            return this.env.pos.packagings && this.env.pos.packagings.length
        },
    });

    Registries.Component.add(ButtonSetPackaging);

    return ButtonSetPackaging;
});
