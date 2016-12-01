/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
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
'use strict';


define([
    'jquery', 
    'onoc.createurl', 
    'onoc.loadcss', 
    'onoc.cachedloader'
], function (jQuery, 
             createUrl, 
             loadcss, 
             CachedLoader) {
    /**
     * This module defines a class defining a widget, that is something
     * you can add as the content of one of the dashboard's placeholders
     */

    function Widget() {
        /**
         * This object misses some properties, as it will receive them directly from the server
         * Contains the JS module of this widget
         * @property {Widget} _module - Choosen widget instance
         */
        this._module = null;
    }

    Widget.prototype = {
        /**
         * Instanciate the widget
         */
        loadWidget: function(){
            var widget = new this._module();
            return widget;
        },

        /**
         * Loads the widget's javascript from the server.
         * RequireJS caches it so it's OK to call it several times.
         * @param {Function} callback
         */
        loadWidgetJS: function (callback) {
            if (this._module) {
                callback();
                return;
            }

            var moduleName = this.generateAMDName();
            var selfRef = this;
            require([moduleName], function (result) {
                selfRef._module = result;
                callback();
            });
        },

        /**
         * Load the stylesheet from current widget
         */
        loadWidgetCSS: function () {
            loadcss(createUrl('/widgets/' + this.id + '.css'));
        },

        /**
         * Generates the name of the AMD module containing the logic of this widget
         */
        generateAMDName: function() {
            return 'widget/' + this.id;
        },

        /**
         * Fills a part with the widget's contents
         * @param {DOMElement} part    - Widget's container
         * @param {Object} initialData - Widget configuration
         * @param {DashboardsManager} DashboardsManager - instance
         */
        fillPart: function (part, initialData, DashboardsManager) {
            // Prepare basic part structure
            this._header = jQuery('<div class="widget-header '+this.id+'"></div>');
            var titleText = initialData.title || this.name;
            this._title = jQuery('<h2>' + titleText + '</h2>');
            var editTitle = jQuery('<div class="widget-command-rename" data-tooltip="Rename this widget"></div>');
            editTitle.click(this._renameClickHandler);
            var datepicker = jQuery('<div class="dropmenu datepicker"><ul class="datemenu"><li class="passive date">'
                                    .concat('<p><span>From</span><span>To</span></p>',
                                            '<p><span><input type="text" class="datePicker from" name="from" value="start" /></span>',
                                            '<span><input type="text" class="datePicker until" name="until" value="end" /></span></p>',
                                            '</li></ul></div>'));
            var refresh = jQuery('<div class="refresh" title="Refresh" data-tooltip="Reload data"></div>');

            var actions = jQuery('<div class="dropmenu actions"></div>');
            var menu = jQuery('<ul class="contentmenu"></ul>');
            var closeBtn = jQuery('<li class="remove">Delete</li>');
            closeBtn.click(function () {
                var that = jQuery(this);
                DashboardsManager.closePart(part);
                that.remove();
            });
            menu.append(closeBtn);
            actions.append(menu);

            //TODO: parts should be built and handled into the chart class, not here
            this._commands = jQuery('<div class="widget-commands"></div>');
            this._header.append(actions);
            this._header.append(datepicker);
            this._header.append(refresh);
            this._header.append(this._title);
            this._header.append(editTitle);

            part.append(this._header);
            part.append(this._commands);

            var container = jQuery('<div></div>');
            part.append(container);

            // Attach the widget's graphics
            this.loadWidgetCSS();

            var instance = this.loadWidget();
            instance.attachTo(container[0], initialData, this);

            return instance;
        },

        /**
         * Create a new data structure with default values for a new part that
         * is being added to a dashboard with this widget
         * @param {DashboardsManager} dashboardsManager - Instance
         */
        createDefaultData: function (dashboardsManager) {
            var defaultData = {
                'widget': this.id,
                'title': this.name
            };

            if (this._module.default)
                defaultData = jQuery.extend(defaultData, this._module.default());

            dashboardsManager.addWidget(defaultData, this);
        },

        /**
         * Rename button action
         * @event
         */
        _renameClickHandler: function (e) {
            e.preventDefault();
            var that = jQuery(this);
            var part = that.closest('li');
            var title = part.find('h2');
            var commands = part.find('div.widget-commands');

            // Hide title and controls
            jQuery(title).fadeOut(25);
            jQuery(commands).fadeOut(25, function () {
                // Show teh edit box
                var txtBox = jQuery('<input type="text" class="widget-title-edit" title="Press enter to validate" />').hide().val(title.text());
                var close = jQuery('<button class="cancel">Cancel</button>');
                var validate = jQuery('<button class="validate">Ok</button>');

                //
                function backToNormal(){
                    txtBox.fadeOut(25, function () {
                        title.fadeIn(25);
                        commands.fadeIn(25);
                        txtBox.remove();
                        close.remove();
                        validate.remove();
                    });
                }

                //
                function save(){
                    var newTitle = txtBox.val();
                    if (newTitle) { // Do not save if the new title is empty
                        require(['dashboards.manager'], function (DashboardManager) {
                            var partData = {};
                            partData.id = parseInt(part.data('part-id'), 10);
                            partData.title = txtBox.val();
                            DashboardManager.savePartData(partData);
                        });
                        title.text(txtBox.val());
                    }

                    backToNormal();
                }

                close.on('click',backToNormal);
                validate.on('click',save);

                txtBox.keyup(function (e) {
                    e.preventDefault();

                    if (e.which === 13) { // If enter key (13) was pressed
                        save();
                    }
                    else if (e.which === 27) { // If escape key (27) was pressed
                        backToNormal();
                    }
                });

                txtBox.insertBefore(title);
                validate.insertBefore(title);
                close.insertBefore(title);
                //part.prepend(close);
                //part.prepend(validate);
                //part.prepend(txtBox);
                txtBox.fadeIn().select();

            });
        }
    };

    // Static functions
    /**
     * Retreive and store widgets
     */
    Widget._listCache = new CachedLoader(createUrl('/dashboards/widgets'), {
        dataType: 'json'
    }, function (data) {
        var transformed = {};
        for (var i = 0, c = data.length; i < c; ++i) {
            var w = data[i];
            var clientWidget = new Widget();
            jQuery.extend(clientWidget, w);
            transformed[clientWidget.id] = clientWidget;
        }
        return transformed;
    });

    /**
     * Return a list of all the widgets that the user can add to the dashboard
     * @param {Function} callback
     */
    Widget.getWidgetsList = function (callback) {
        Widget._listCache.getData(function (result) {
            var ar = jQuery.map(result, function (value) {
                return value;
            });
            callback(ar);
        });
    };

    /**
     * Retrieves one specific widget. The callback is called
     * with the found widget as a parameter. If no widget is found with this
     * id, the callback is called with a null parameter.
     * @param {String} id - Widget's name
     * @param {Function} callback
     * @param {Boolean} dontLoadModule
     */
    Widget.getWidgetById = function (id, callback, dontLoadModule) {
        dontLoadModule = !!dontLoadModule;
        Widget._listCache.getData(function (result) {
            if (id in result) {
                var widget = result[id];
                if (dontLoadModule) {
                    callback(widget);
                }
                else {
                    // Make sure the widget module is loaded before continuing.
                    widget.loadWidgetJS(function () {
                        callback(widget);
                    });
                }
            }
            else
                callback(null);
        });
    };

    return Widget;
});
