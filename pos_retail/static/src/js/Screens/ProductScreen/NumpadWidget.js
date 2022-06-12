odoo.define('pos_retail.NumpadWidget', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const NumpadWidget = require('point_of_sale.NumpadWidget');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    NumpadWidget.template = 'NumpadWidgetRetail';
    Registries.Component.add(NumpadWidget);

    const RetailNumpadWidget = (NumpadWidget) =>
        class extends NumpadWidget {
            async changeMode(mode) {
                if (mode == 'discount' && (!this.env.pos.config.allow_numpad || !this.env.pos.config.allow_discount)) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('You have not permission change Discount')
                    })
                }
                if (mode == 'quantity' && (!this.env.pos.config.allow_numpad || !this.env.pos.config.allow_discount)) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('You have not permission change Quantity')
                    })
                }
                if (mode == 'price' && (!this.env.pos.config.allow_numpad || !this.env.pos.config.allow_price)) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('You have not permission change Quantity')
                    })
                }
                if (this.env.pos.config.validate_quantity_change && mode == 'quantity') {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve change to mode Quantity'));
                    if (!validate) {
                        return false;
                    }
                }
                if (this.env.pos.config.validate_price_change && mode == 'price') {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve change to mode Price'));
                    if (!validate) {
                        return false;
                    }
                }
                if (this.env.pos.config.validate_discount_change && mode == 'discount') {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve change to mode Discount'));
                    if (!validate) {
                        return false;
                    }
                }
                super.changeMode(mode);
            }

            async sendInput(key) {
                if (this.env.pos.config.validate_change_minus && key == '-') {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve change amount smaller or equal 0'));
                    if (!validate) {
                        return false;
                    }
                }
                if (this.env.pos.config.validate_remove_line && (key == 'Delete' || key == 'Backspace')) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve delete line'));
                    if (!validate) {
                        return false;
                    }
                }
                super.sendInput(key);
            }
        }
    Registries.Component.extend(NumpadWidget, RetailNumpadWidget);

    return NumpadWidget;
});
