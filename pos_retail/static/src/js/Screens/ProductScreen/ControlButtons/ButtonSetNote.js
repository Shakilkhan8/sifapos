odoo.define('pos_retail.ButtonSetNote', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetNote extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            var order = this.env.pos.get_order();
            const list = [
                {
                    id: 1,
                    label: this.env._t('Note Selected Line'),
                    item: 1,
                },
                {
                    id: 2,
                    label: this.env._t('Note Selected Order'),
                    item: 2,
                },
            ];
            const {confirmed, payload: selected_item} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Choice one'),
                list: list
            })
            if (confirmed) {
                const {confirmed, payload: note} = await this.showPopup('TextAreaPopup', {
                    title: this.env._t('Set Note to selected Order'),
                    inputValue: order.note
                })
                if (confirmed) {
                    if (selected_item == 2) {
                        order.set_note(note)
                    } else {
                        let line = order.get_selected_orderline();
                        if (line) {
                            line.set_line_note(note)
                        } else {
                            return this.showPopup('ErrorPopup', {
                                title: this.env._t('Nothing line in cart')
                            })
                        }
                    }

                }

            }

        }
    }

    ButtonSetNote.template = 'ButtonSetNote';

    ProductScreen.addControlButton({
        component: ButtonSetNote,
        condition: function () {
            return this.env.pos.config.note_order;
        },
    });

    Registries.Component.add(ButtonSetNote);

    return ButtonSetNote;
});
