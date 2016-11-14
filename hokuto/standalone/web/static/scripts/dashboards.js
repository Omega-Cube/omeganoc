/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
 * Nicolas Lantoing, nicolas@omegacube.fr
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
require(['jquery', 'dashboards.manager', 'onoc.createurl', 'dashboards.widget', 'jquery.validate', 'jquery.bpopup'], function (jQuery, DashboardsManager, createurl, Widget) {
    /**
     * Create Dashboard button behavior
     */
    function initCreateButton() {
        jQuery('#create-dashboard-button').click(function (e) {
            e.preventDefault();

            showDashboardNamePopup(function (result) {
                showAddWidgetPopup(function (widget) {
                    DashboardsManager.createDashboard(result,widget);
                });
            }, 'Create a dashboard');
        });

        // Rename Dashboard button behavior
        jQuery('#rename-dashboard-button').click(function (e) {
            e.preventDefault();
            showDashboardNamePopup(function (result) {
                DashboardsManager.renameCurrentDashboard(result);
            }, 'Rename a dashboard');
        });


        var p = jQuery('#create-dashboard-popup');

        // Send the form - close the popup
        p.find('[type=submit]').click(function (e) {
            e.preventDefault();
            var form = jQuery('#createForm');
            if (form.valid()) {
                var name = form.find('#createNameField').val();
                jQuery('#create-dashboard-popup').bPopup().close();

                showDashboardNamePopup._callback(name);
            }
        });

        // Cancel
        p.find('[type=reset]').click(function (e) {
            e.preventDefault();
            jQuery('#create-dashboard-popup').bPopup().close();
        });

        // Form validation
        var form = $('#createForm');
        form.validate({
            rules: {
                name: {
                    required: true,
                    remote: createurl('/dashboards/checkname')
                }
            }
        });
    }

    /**
     * Add widget popup button
     */
    function initAddWidgetButton() {
        jQuery('#add-widget-button').click(function (e) {
            e.preventDefault();

            showAddWidgetPopup(function (widget) {
                DashboardsManager.buildWidget(widget);
                setTimeout(function(){
                    var newwidget = $('#dashboard > ul > li');
                    newwidget = newwidget[newwidget.length - 1];
                    $('#dashboard').scrollTop(newwidget.offsetTop);
                },150);
            });
        });

        // Cancel button
        jQuery('#add-widget-popup > input').click(function (e) {
            e.preventDefault();

            jQuery('#add-widget-popup').bPopup().close();
        });
    }

    /**
     * Updates the widgets list with data from the server
     */
    function _updateList() {
        Widget.getWidgetsList(function (result) {
            var list = jQuery(document.getElementById('add-widget-list'));

            list.empty();

            for (var i = 0, c = result.length; i < c; ++i) {
                var widget = result[i];
                var li = jQuery('<li data-widget-id="' + widget.id + '"><a href="#">' + widget.name + '</a></li>');
                li.data('widget-id', widget.id);

                var addLink = li.find('a');
                addLink.click(function (e) {
                    e.preventDefault();

                    var that = $(this);
                    var wId = that.parent().data('widget-id');

                    showAddWidgetPopup._callback(wId)

                    jQuery('#add-widget-popup').bPopup().close();
                });

                list.append(li);
            }

            // Update the scrollbar
            jQuery('#add-widget-popup [data-scrollbar]').trigger('updatescrollbar.onoc');
        });
    }

    /**
     * Display addWidget popup interface
     * @param {Function} callback
     */
    function showAddWidgetPopup(callback) {
        var popup = jQuery('#add-widget-popup');
        popup.bPopup();

        // Update the list inside the popup
        _updateList();

        // Update the scroll bar inside the popup AFTER it's been shown
        // so the sizes are correct to compute the scrollbar area
        popup.find('[data-scrollbar]').trigger('updatescrollbar.onoc');

        showAddWidgetPopup._callback = callback;
    }

    /**
     * Show a popup used to input a dashboard name (for creation or renaming)
     * @param {Function} callback
     * @param {String} title - Popup title to display
     */
    function showDashboardNamePopup(callback, title) {
        var panel = jQuery('#create-dashboard-popup');
        var form = jQuery('#createForm');

        form.validate().resetForm();
        form.find('input[type=text]').removeClass('error'); // For some reason, the resetForm method won't remove the error class from the field...
        panel.find('h2').text(title);
        panel.bPopup();
        panel.find('input[type=text]').val('')[0].focus();

        showDashboardNamePopup._callback = callback;
    }

    jQuery(document).ready(function() {
        initCreateButton();
        initAddWidgetButton();

        // Start showing the dashboard
        DashboardsManager.init($('#dashboard > ul'));
    });
});
