odoo.define('pos_retail.AbstractAwaitablePopup', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    Registries.Component.add(AbstractAwaitablePopup);

    const RetailAbstractAwaitablePopup = (AbstractAwaitablePopup) =>
        class extends AbstractAwaitablePopup {
            constructor() {
                super(...arguments);
            }
        }
    Registries.Component.extend(AbstractAwaitablePopup, RetailAbstractAwaitablePopup);
    return RetailAbstractAwaitablePopup;
});
