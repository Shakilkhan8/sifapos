odoo.define('pos_retail.ButtonSetUnit', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetUnit extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
            let selectedOrder = this.env.pos.get_order()
            if (!selectedOrder || !selectedOrder.get_selected_orderline()) {
                return false
            }
            let selectedLine = selectedOrder.get_selected_orderline()
            if (selectedLine && selectedLine.has_multi_unit()) {
                return true
            } else {
                return false
            }
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


        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            if (!this.isHighlighted) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Product have only one Unit')
                })
            }
            let selected_orderline = this.env.pos.get_order().selected_orderline;
            let uom_items = this.env.pos.uoms_prices_by_product_tmpl_id[selected_orderline.product.product_tmpl_id];
            let list = uom_items.map((u) => ({
                id: u.id,
                label: u.uom_id[1] + ' with price: ' + this.env.pos.format_currency(u.price),
                item: u
            }));
            let {confirmed, payload: unit} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Choice unit for set to Selected Line'),
                list: list
            })
            if (confirmed) {
                selected_orderline.set_unit(unit.uom_id[0], unit.price)
            }
        }
    }

    ButtonSetUnit.template = 'ButtonSetUnit';

    ProductScreen.addControlButton({
        component: ButtonSetUnit,
        condition: function () {
            return this.env.pos.uoms_prices && this.env.pos.uoms_prices.length;
        },
    });

    Registries.Component.add(ButtonSetUnit);

    return ButtonSetUnit;
});
