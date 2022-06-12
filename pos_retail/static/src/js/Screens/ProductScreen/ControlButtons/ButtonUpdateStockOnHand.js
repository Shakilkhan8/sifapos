odoo.define('pos_retail.ButtonUpdateStockOnHand', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonUpdateStockOnHand extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
            return this.env.pos.update_stock_active
        }

        async onClick() {
            this.env.pos.update_stock_active = !this.env.pos.update_stock_active;
            if (this.env.pos.update_stock_active) {
                var products = this.env.pos.db.get_product_by_category(0);
                var products_outof_stock = _.filter(products, function (product) {
                    return product.type == 'product' && product.qty_available <= 0;
                });
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t('Total products out of stock is: ') + products_outof_stock.length + this.env._t(' You can click to any product for update stock')
                })
            } else {
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t('Now is normal mode, you can add products to cart')
                })
            }
        }
    }

    ButtonUpdateStockOnHand.template = 'ButtonUpdateStockOnHand';

    ProductScreen.addControlButton({
        component: ButtonUpdateStockOnHand,
        condition: function () {
            return this.env.pos.config.big_datas_sync_backend;
        },
    });

    Registries.Component.add(ButtonUpdateStockOnHand);

    return ButtonUpdateStockOnHand;
});
