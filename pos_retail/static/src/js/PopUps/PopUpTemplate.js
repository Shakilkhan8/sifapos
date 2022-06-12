odoo.define('pos_retail.PopUpCreatePurchaseOrder', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useListener} = require('web.custom_hooks');

    class PopUpCreatePurchaseOrder extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {

            }
            this.state = useState(this.change);
            this.orderUiState = useContext(contexts.orderManagement);
            useListener('click-item', this.onClickItem);
        }

        OnChange(event) {
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            this.render()
        }


        getPayload() {
            return this.changes
        }
    }

    PopUpCreatePurchaseOrder.template = 'PopUpCreatePurchaseOrder';
    PopUpCreatePurchaseOrder.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpCreatePurchaseOrder);

    return PopUpCreatePurchaseOrder
});
