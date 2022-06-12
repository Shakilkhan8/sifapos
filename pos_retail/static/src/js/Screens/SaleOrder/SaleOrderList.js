odoo.define('pos_retail.SaleOrderList', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');


    class SaleOrderList extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = {
                orders: this.env.pos.db.get_sale_orders(),
                query: null,
                selectedOrder: this.props.order,
                selectedClient: this.props.selectedClient,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    order: null
                },
            };
            this.updateOrderList = debounce(this.updateOrderList, 70);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
        }

        willPatch() {
            posbus.off('save-sale-order', this);
        }

        patched() {
            posbus.on('save-sale-order', this, this.reloadScreen);
        }

        mounted() {
            posbus.on('save-sale-order', this, this.reloadScreen);
        }

        willUnmount() {
            posbus.off('save-sale-order', this);
        }

        reloadScreen() {
            if (this.state.selectedOrder) {
                let orders = this.env.pos.db.get_sale_orders()
                let orderJustUpdated = orders.find(o => o.id == this.state.selectedOrder.id)
                this.state.editModeProps = {
                    order: orderJustUpdated,
                };
                this.state.detailIsShown = true;
            }
            this.render()
        }

        // Lifecycle hooks
        back() {
            if (this.state.detailIsShown) {
                this.state.detailIsShown = false;
                this.render();
            } else {
                this.props.resolve({confirmed: false, payload: false});
                this.trigger('close-temp-screen');
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
            return orders
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

        clickNext() {
            this.state.selectedOrder = this.nextButton.command === 'set' ? this.state.selectedOrder : null;
            this.confirm();
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
                'Number': (order) => order.name,
                'Sale Person': (order) => order.user_id[1],
                'Date Order (MM/DD/YYYY)': (order) => moment(order.date_order).format('MM/DD/YYYY hh:mm A'),
                Customer: (order) => order.partner_id[1],
                ID: (order) => order.id,
            };
            return fields;
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            return [
                'All Orders',
                'Quotation',
                'Quotation Sent',
                'Sale Order',
                'Looked',
                'Cancelled',
                'Booked',
            ];
        }

        get _stateSelectionFilter() {
            return {
                draft: 'Quotation',
                sent: 'Quotation Sent',
                sale: 'Sale Order',
                done: 'Looked',
                cancel: 'Cancelled',
                booked: 'Booked',
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
            const orders = this.env.pos.db.get_sale_orders()
            return orders
        }
    }

    SaleOrderList.template = 'SaleOrderList';

    Registries.Component.add(SaleOrderList);

    return SaleOrderList;
});
