odoo.define('pos_retail.ButtonCreateLots', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonCreateLots extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            let self = this;
            let selectedOrder = this.env.pos.get_order();
            let selectedLine = selectedOrder.get_selected_orderline();
            if (!selectedLine) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Please add Product have tracking by Lot to cart the first'),
                })
            }
            let {confirmed} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Warning'),
                body: this.env._t('Will create multi lots with quantity of Line selected: ') + selectedLine.product.display_name + this.env._t(', with quantity: ') + selectedLine.quantity
            })
            if (confirmed) {

                let {confirmed, payload} = await this.showPopup('EditListPopup', {
                    title: this.env._t('Create: Lot(s)/Serial Number. Press Enter to keyboard for add more lines'),
                    array: [],
                });
                if (confirmed) {
                    const lots = payload.newArray.map((item) => ({
                        name: item.text,
                        product_qty: selectedLine.quantity,
                        product_id: selectedLine.product.id,
                        company_id: this.env.pos.company.id
                    }));
                    if (lots.length > 0) {
                        let countsCreated = await this.rpc({
                            model: 'stock.production.lot',
                            method: 'create',
                            args: [lots]
                        }).then(function (lot_ids) {
                            return lot_ids
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        })
                        if (countsCreated > 0) {
                            this.showPopup('ConfirmPopup', {
                                title: this.env._t('Succeed'),
                                body: countsCreated + this.env._t(' lots just created, you can use it now.')
                            })
                        }
                    }
                }
            }

        }
    }

    ButtonCreateLots.template = 'ButtonCreateLots';

    ProductScreen.addControlButton({
        component: ButtonCreateLots,
        condition: function () {
            return this.env.pos.config.create_lots;
        },
    });

    Registries.Component.add(ButtonCreateLots);

    return ButtonCreateLots;
});
