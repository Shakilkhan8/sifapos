odoo.define('pos_retail.PosOrderScreen', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const IndependentToOrderScreen = require('point_of_sale.IndependentToOrderScreen');

    /**
     * @props order - originally selected order
     */
    class PosOrderScreen extends IndependentToOrderScreen {
        constructor() {
            super(...arguments);
            // useListener('click-save', () => this.env.bus.trigger('save-customer'));
            useListener('click-view', () => this.viewOrder());
            // useListener('save-changes', this.saveChanges);

            // We are not using useState here because the object
            // passed to useState converts the object and its contents
            // to Observer proxy. Not sure of the side-effects of making
            // a persistent object, such as pos, into owl.Observer. But it
            // is better to be safe.
            this.state = {
                query: null,
                selectedOrder: this.props.order,
                selectedClient: this.props.selectedClient,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    partner: {
                        country_id: this.env.pos.company.country_id,
                        state_id: this.env.pos.company.state_id,
                    }
                },
            };
            this.updateOrderList = debounce(this.updateOrderList, 70);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
        }

        // Lifecycle hooks
        back() {
            if (this.state.detailIsShown) {
                this.state.detailIsShown = false;
                this.render();
            } else {
                this.close()
            }
        }

        confirm() {
            this.props.resolve({confirmed: true, payload: this.state.selectedOrder});
            this.trigger('close-temp-screen');
        }

        // Getters

        get currentOrder() {
            return this.env.pos.get_order();
        }

        get getOrders() {
            // if (this.state.query && this.state.query.trim() !== '') {
            //     return this.env.pos.db.search_order(this.state.query.trim());
            // } else {
            //     return this.env.pos.db.get_pos_orders(1000)
            // }
            let selectedOrder = this.env.pos.get_order();
            const filterCheck = (order) => {
                if (this.filter && this.filter !== 'All Orders') {
                    const state = order.state;
                    return this.filter === this.constants.stateSelectionFilter[state];
                }
                return true;
            };
            const {fieldValue, searchTerm} = this.searchDetails;
            const fieldAccessor = this._searchFields[fieldValue];
            const searchCheck = (order) => {
                if (!fieldAccessor) return true;
                const fieldValue = fieldAccessor(order);
                if (fieldValue === null) return true;
                if (!searchTerm) return true;
                return fieldValue && fieldValue.toString().toLowerCase().includes(searchTerm.toLowerCase());
            };
            const predicate = (order) => {
                return filterCheck(order) && searchCheck(order);
            };
            let orders = this.orderList.filter(predicate);
            if (selectedOrder && selectedOrder.get_client()) {
                let client = selectedOrder.get_client()
                orders = orders.filter((o) => o.partner_id && o.partner_id[0] == client.id)
                return orders
            } else {
                return orders
            }
        }

        get isNextButtonVisible() {
            return this.state.selectedOrder ? true : false;
        }

        /**
         * Returns the text and command of the next button.
         * The command field is used by the clickNext call.
         */
        get nextButton() {
            if (!this.props.order) {
                return {command: 'set', text: 'Set Customer'};
            } else if (this.props.order && this.props.order === this.state.selectedOrder) {
                return {command: 'deselect', text: 'Deselect Customer'};
            } else {
                return {command: 'set', text: 'Change Customer'};
            }
        }

        // Methods

        // We declare this event handler as a debounce function in
        // order to lower its trigger rate.
        updateOrderList(event) {
            this.state.query = event.target.value;
            const clients = this.clients;
            if (event.code === 'Enter' && clients.length === 1) {
                this.state.selectedOrder = clients[0];
                this.clickNext();
            } else {
                this.render();
            }
        }

        clickOrder(event) {
            let order = event.detail.order;
            if (this.state.selectedOrder === order) {
                this.state.selectedOrder = null;
            } else {
                this.state.selectedOrder = order;
            }
            this.state.editModeProps = {
                order: this.state.selectedOrder,
            };
            this.state.detailIsShown = true;
            this.render();
        }

        viewOrder() {
            this.state.editModeProps = {
                order: this.state.selectedOrder,
            };
            this.render();
        }

        clickNext() {
            this.state.selectedOrder = this.nextButton.command === 'set' ? this.state.selectedOrder : null;
            this.confirm();
        }

        activateEditMode(event) {
            const {isNewClient} = event.detail;
            this.state.isEditMode = true;
            this.state.detailIsShown = true;
            this.state.isNewClient = isNewClient;
            if (!isNewClient) {
                this.state.editModeProps = {
                    partner: this.state.selectedOrder,
                };
            }
            this.render();
        }

        deactivateEditMode() {
            this.state.isEditMode = false;
            this.state.editModeProps = {
                partner: {
                    country_id: this.env.pos.company.country_id,
                    state_id: this.env.pos.company.state_id,
                },
            };
            this.render();
        }

        cancelEdit() {
            this.deactivateEditMode();
        }

        clearSearch() {
            this._initializeSearchFieldConstants()
            this.filter = this.filterOptions[0];
            this.searchDetails = {};
            let selectedOrder = this.env.pos.get_order();
            selectedOrder.set_client(null);
            this.render()
        }


        // TODO: ==================== Seach bar example ====================

        get searchBarConfig() {
            return {
                searchFields: this.constants.searchFieldNames,
                filter: {show: true, options: this.filterOptions},
            };
        }

        // TODO: define search fields
        get _searchFields() {
            var fields = {
                'Receipt Number': (order) => order.name,
                'Sale Person': (order) => order.sale_person,
                'Create Date (MM/DD/YYYY)': (order) => moment(order.create_date).format('MM/DD/YYYY hh:mm A'),
                'Order Date (MM/DD/YYYY)': (order) => moment(order.date_order).format('MM/DD/YYYY hh:mm A'),
                'Paid Date (MM/DD/YYYY)': (order) => moment(order.paid_date).format('MM/DD/YYYY hh:mm A'),
                Customer: (order) => order.partner_id[1],
                Session: (order) => order.session,
                Ref: (order) => order.pos_reference,
                Ean13: (order) => order.ean13,
                ID: (order) => order.id,
            };
            return fields;
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            return [
                'All Orders',
                'Draft',
                'Cancelled',
                'Paid',
                'Done',
                'Invoiced',
                'Quotation',
                'Delivery',
                'Delivered',
                'Received',
            ];
        }

        get _stateSelectionFilter() {
            return {
                draft: 'Draft',
                cancel: 'Cancelled',
                paid: 'Paid',
                done: 'Done',
                invoiced: 'Invoiced',
                quotation: 'Quotation',
                delivery: 'Delivery',
                delivered: 'Delivered',
            };
        }

        // TODO: register search bar
        _initializeSearchFieldConstants() {
            this.constants = {};
            Object.assign(this.constants, {
                searchFieldNames: Object.keys(this._searchFields),
                stateSelectionFilter: this._stateSelectionFilter,
            });
        }

        // TODO: save filter selected on searchbox of user for getOrders()
        _onFilterSelected(event) {
            this.filter = event.detail.filter;
            this.render();
        }

        // TODO: save search detail selected on searchbox of user for getOrders()
        _onSearch(event) {
            const searchDetails = event.detail;
            Object.assign(this.searchDetails, searchDetails);
            this.render();
        }

        // TODO: return orders of system
        get orderList() {
            return this.env.pos.db.get_pos_orders()
        }
    }

    PosOrderScreen.template = 'PosOrderScreen';

    Registries.Component.add(PosOrderScreen);

    return PosOrderScreen;
});
