odoo.define('pos_retail.RetailActionpadWidget', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ActionpadWidget = require('point_of_sale.ActionpadWidget');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    ActionpadWidget.template = 'RetailActionpadWidget';
    Registries.Component.add(ActionpadWidget);

    return ActionpadWidget;
});
