odoo.define('pos_retail.ButtonSetTags', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetTags extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
            let selectedOrder = this.env.pos.get_order();
            if (!selectedOrder.get_selected_orderline()) {
                return false
            }
            let line = this.env.pos.get_order().get_selected_orderline();
            if (!line.tag_ids || line.tag_ids.length == 0) {
                return true
            } else {
                return false
            }

        }

        async onClick() {
            let selectedLine = this.env.pos.get_order().get_selected_orderline();
            let selectedTags = selectedLine.tags || [];
            let selectedTagsIds = selectedTags.map((t) => t.id)
            let tags = this.env.pos.tags;
            tags.forEach(function (t) {
                if (selectedTagsIds.indexOf(t.id) != -1) {
                    t.selected = true
                } else {
                    t.selected = false;
                }
                t.display_name = t.name;
            })
            let {confirmed, payload: results} = await this.showPopup('PopUpMultiChoice', {
                title: this.env._t('Select Multi Tags, Notes'),
                items: tags
            })
            if (confirmed) {
                let newTags = results.items.map((t) => t.id)
                selectedLine.set_tags(newTags);
            }
        }
    }

    ButtonSetTags.template = 'ButtonSetTags';

    ProductScreen.addControlButton({
        component: ButtonSetTags,
        condition: function () {
            return this.env.pos.tags;
        },
    });

    Registries.Component.add(ButtonSetTags);

    return ButtonSetTags;
});
