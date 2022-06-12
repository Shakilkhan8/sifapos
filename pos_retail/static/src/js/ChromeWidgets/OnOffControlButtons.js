odoo.define('pos_retail.OnOffControlButtons', function (require) {
    'use strict';

    const {useState} = owl;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class OnOffControlButtons extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({on_off_control_buttons: false});
        }

        onClick() {
            this.state.on_off_control_buttons = !this.state.on_off_control_buttons
            this.env.pos.on_off_control_buttons = this.state.on_off_control_buttons;
            posbus.trigger('on-off-control-buttons')
            this.render()
        }
    }

    OnOffControlButtons.template = 'OnOffControlButtons';

    Registries.Component.add(OnOffControlButtons);

    return OnOffControlButtons;
});
