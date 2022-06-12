odoo.define('pos_retail.PopUpMultiChoice', function (require) {
    'use strict';

    const {useState} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const PosComponent = require('point_of_sale.PosComponent');

    class PopUpMultiChoice extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this._id = 0;
            this.items = this.props.items;
            this.items.forEach(function (i) {
                if (!i.selected) i.selected = false;
            })
            this.state = useState({
                items: this.items,
            });
            useListener('click-item', this.onClickItem);
        }

        onClickItem(event) {
            let item = event.detail.item;
            item.selected = !item.selected;
            this.state.items.forEach(function (i) {
                if (i.id == item.id) {
                    i.selected = item.selected;
                }
            })
            this.state.editModeProps = {
                items: this.state.items
            }
            this.render()
        }


        get Items() {
            if (!this.state.editModeProps) {
                return this.items
            } else {
                return this.state.editModeProps.items
            }

        }

        getPayload() {
            return {
                items: this.items
                    .filter((i) => i.selected)
            };
        }
    }

    PopUpMultiChoice.template = 'PopUpMultiChoice';
    PopUpMultiChoice.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };
    Registries.Component.add(PopUpMultiChoice);


    class Item extends PosComponent {
        onKeyup(event) {
            if (event.key === "Enter" && event.target.value.trim() !== '') {
                debugger
            }
        }
    }

    Item.template = 'Item';
    Registries.Component.add(Item);
    return Item;

    return {
        PopUpMultiChoice: PopUpMultiChoice,
        Item: Item,
    };
});
