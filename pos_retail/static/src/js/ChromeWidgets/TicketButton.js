odoo.define('pos_retail.TicketButton', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const TicketButton = require('point_of_sale.TicketButton');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const RetailTicketButton = (TicketButton) =>
        class extends TicketButton {
            constructor() {
                super(...arguments);
            }

            get isKitchenScreen() {
                if (!this || !this.env || !this.env.pos || !this.env.pos.config) {
                    return false
                } else {
                    if (this.env.pos.config.screen_type  == 'kitchen') {
                        return true
                    } else {
                        return false
                    }
                }
            }

        }
    TicketButton.template = 'RetailTicketButton'
    Registries.Component.extend(TicketButton, RetailTicketButton);

    return RetailTicketButton;
});
