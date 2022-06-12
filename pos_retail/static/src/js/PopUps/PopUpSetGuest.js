odoo.define('pos_retail.PopUpSetGuest', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const PosComponent = require('point_of_sale.PosComponent');
    const contexts = require('point_of_sale.PosContext');
    var core = require('web.core');
    var _t = core._t;

    class PopUpSetGuest extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            let order = this.env.pos.get_order();
            this.changes = {
                guest: order.guest || '',
                guest_number: order.guest_number || 0,
            }
        }

        OnChange(event) {
            let target_name = event.target.name;
            this.changes[event.target.name] = event.target.value;
        }

        getPayload() {
            return this.changes
        }
    }

    PopUpSetGuest.template = 'PopUpSetGuest';
    PopUpSetGuest.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpSetGuest);

    return PopUpSetGuest
});
