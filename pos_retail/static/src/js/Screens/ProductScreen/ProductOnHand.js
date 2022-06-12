odoo.define('pos_retail.ProductOnHand', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ProductOnHand extends PosComponent {
        constructor() {
            super(...arguments);
        }

    }

    ProductOnHand.template = 'ProductOnHand';

    Registries.Component.add(ProductOnHand);

    return ProductOnHand;
});
