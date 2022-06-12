odoo.define('pos_retail.ProductViewWidget', function (require) {
    'use strict';

    const {useState} = owl;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class ProductViewWidget extends PosComponent {
        constructor() {
            super(...arguments);
            let ProductView = {
                product_view: 'box'
            }
            this.state = useState({product_view: ProductView.product_view});
        }

        onClick() {
            var product_view = this.state.product_view;
            if (product_view == 'list') {
                product_view = 'box'
            } else {
                product_view = 'list'
            }
            this.env.pos.config.product_view = product_view;
            this.state.product_view = product_view
            posbus.trigger('switch-product-view')
            this.render()
        }
    }

    ProductViewWidget.template = 'ProductViewWidget';

    Registries.Component.add(ProductViewWidget);

    return ProductViewWidget;
});
