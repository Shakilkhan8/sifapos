odoo.define('pos_retail.ProductItem', function (require) {
    'use strict';

    const ProductItem = require('point_of_sale.ProductItem');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    ProductItem.template = 'RetailProductItem';
    Registries.Component.add(ProductItem);

    const RetailProductItem = (ProductItem) =>
        class extends ProductItem {
            constructor() {
                super(...arguments);
            }

            reloadProductItem() {
                if (this.env.pos.db.stock_datas) {
                    this.props.product.qty_available = this.env.pos.db.stock_datas[this.props.product.id]
                }
                this.render();
            }

            mounted() {
                this.env.pos.on('orderWidget.updated', () => this.reloadProductItem(), this);
            }

            willUnmount() {
                this.env.pos.off('orderWidget.updated', null, this);
            }

            get price() {
                let price = 0;
                if (!this.env.pos.config.display_sale_price_within_tax) {
                    price = this.props.product.get_price_with_tax(this.pricelist, 1)
                } else {
                    price = this.props.product.get_price(this.pricelist, 1)
                }
                const formattedUnitPrice = this.env.pos.format_currency(
                    price,
                    'Product Price'
                );
                if (this.props.product.to_weight) {
                    return `${formattedUnitPrice}/${
                        this.env.pos.units_by_id[this.props.product.uom_id[0]].name
                    }`;
                } else {
                    return formattedUnitPrice;
                }
            }

            get itemInCart() {
                let product = this.props.product;
                let selectedOrder = this.env.pos.get_order();
                let totalItems = 0
                if (selectedOrder) {
                    let orderLines = _.filter(selectedOrder.orderlines.models, function (o) {
                        return o.product.id == product.id
                    })
                    orderLines.forEach(function (l) {
                        totalItems += l.quantity
                    })
                }
                return totalItems
            }
        }
    Registries.Component.extend(ProductItem, RetailProductItem);

    return ProductItem;
});
