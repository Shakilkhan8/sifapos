odoo.define('pos_retail.ProductsWidget', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductsWidget = require('point_of_sale.ProductsWidget');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    const RetailProductsWidget = (ProductsWidget) =>
        class extends ProductsWidget {
            constructor() {
                super(...arguments);
            }

            mounted() {
                super.mounted();
                posbus.on('switch-product-view', this, this.render);
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('switch-product-view', this);
            }

            remove_product_out_of_screen(product) {
                debugger
            }

            reload_products_screen(product_datas) {
                this.render();
            }

            get productsToDisplay() {
                let products = super.productsToDisplay
                return products
            }
        }
    Registries.Component.extend(ProductsWidget, RetailProductsWidget);

    return RetailProductsWidget;
});
