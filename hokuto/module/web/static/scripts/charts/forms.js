/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
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
define(['jquery','dashboards.manager','dashboards.probes'], function(jQuery,DashboardManager,DashboardProbes) {

    /**
     * Tools to build basicchart's panel forms
     */
    var DashboardChartForm = {
        /**
         * Unit selection form
         * @param {String} current - The current unit selected if any
         * @param {String} probe   - The target probe on edit panel
         * @param {Array} units    - Units list
         * @return form container
         */
        unitSelect : function(current,probe,units){
            var container = $('<select name="unit" style="display:table-cell;" class="formButton select"></select>');
            for(var u in units)
                container.append('<option '+((current === u) ? 'selected="selected"': '')+' value="'+u+'">'+u+'</option>');

            if(probe)
                container[0].addEventListener('change',function(event){
                    var scale = this.scales[this.probes[probe].scale];
                    var newVal = this.getScale(event.target.value, scale.orient,scale.reversed,scale.stacked);

                    this.probes[probe].scale = newVal;

                    var query = {
                        'id': this.id,
                        'conf': {
                            'probes': {}
                        }
                    };
                    query.conf.probes[probe] = {'scale': newVal};
                    //TODO
                    query.conf = JSON.stringify(query.conf);
                    DashboardManager.savePartData(query);

                    this.setDomain(this.data);

                    if(!this.scales[scale.name].boundedProbe){
                        DashboardProbes.remove(this.id,false,scale.name);
                        delete this.scales[scale.name];
                    }
                    this.cleanScales();
                    this.buildAxis();
                    this.redraw();
                    
                    this.flushPanel();
                    this.buildEditPanel();
                    var context = this.axis.x2.domain();
                    var focus = this.axis.x.domain();
                    DashboardProbes.worker.postMessage([8,{
                        'probes': this.probes,
                        'contextTimeline': [context[0].getTime(),context[1].getTime()],
                        'focusTimeline': [focus[0].getTime(),focus[1].getTime()],
                        'mode': this.conf.mode
                    },this.id]);
                }.bind(this));

            return container;
        },

        /**
         * Orientation selection form (left or right sided)
         * @param {String} current - Current selected orient
         * @param {String} probe   - Target probe name
         * @return form container
         */
        orientSelect : function(current,probe){
            var container = $('<span style="display:table-cell;"></span>');
            var orient = $('<select name="orient" class="hidden"></select>');
            orient.append('<option '+((current === 'left') ? 'selected="selected"': '')+' value="left">Left</option>');
            orient.append('<option '+((current === 'right') ? 'selected="selected"': '')+' value="right">Right</option>');

            var button = $('<button style="width:3.25em;" class="formButton"></button>');
            var values = ['left','right'];
            var probe = probe;
            button.text((current === 'right') ? 'Right' : 'Left');

            button[0].addEventListener('click',function(event){
                event.preventDefault();
                var current = event.target.parentNode.getElementsByClassName('hidden')[0].value;
                var index = values.indexOf(current) + 1;
                if(index === values.length)
                    index = 0;
                var newVal = values[index];
                event.target.parentNode.getElementsByClassName('hidden')[0].value = newVal;
                button.text(newVal.charAt(0).toUpperCase().concat(newVal.slice(1)));

                var scale = this.scales[this.probes[probe].scale];
                var newVal = this.getScale(scale.unit, newVal , scale.reversed, scale.stacked);
                this.probes[probe].scale = newVal;
                var query = {
                    'id': this.id,
                    'conf': {
                        'probes': {}
                    }
                };
                query.conf.probes[probe] = {'scale': newVal};
                //TODO
                query.conf = JSON.stringify(query.conf);
                DashboardManager.savePartData(query);
                this.setDomain(this.data);
                if(!this.scales[scale.name].boundedProbe){
                    DashboardProbes.remove(this.id,false,scale.name);
                    delete this.scales[scale.name];
                }
                this.cleanScales();
                this.redraw();
                
                this.flushPanel();
                this.buildEditPanel();
                
                var context = this.axis.x2.domain();
                var focus = this.axis.x.domain();
                DashboardProbes.worker.postMessage([8,{
                    'probes': this.probes,
                    'contextTimeline': [context[0].getTime(),context[1].getTime()],
                    'focusTimeline': [focus[0].getTime(),focus[1].getTime()],
                    'mode': this.conf.mode
                },this.id]);


            }.bind(this));

            container.append(button);
            container.append(orient);
            return container;
        },

        /**
         * Orientation selection form (left or right sided) for add-panel
         * @param {String} current - Current selected orient
         * @param {String} probe   - Target probe name
         * @return form container
         */
        orientAddSelect : function(current){
            var current = current || 'left';
            var values = ['left','right'];

            var container = $('<p class="orient"></p>');
            container.append('<button data-index="0" data-value="left" '+((current === 'left') ? 'class="selected"': '')+'>left</button>');
            container.append('<button data-index="1" data-value="right" '+((current === 'right') ? 'class="selected"': '')+'>right</button>');

            var select = $('<select name="orient" class="hidden"></select>');
            select.append('<option '+((current === 'left') ? 'selected="selected"': '')+' value="left"></option>');
            select.append('<option '+((current === 'right') ? 'selected="selected"': '')+' value="right"></option>');


            var button = $('<button style="width:3.25em;" class="formButton"></button>');

            var probe = probe;

            container.on('click',function(e){
                e.preventDefault();
                var newindex = e.target.dataset.index;
                var newval = e.target.dataset.value;
                if(!newval || newindex === select[0].selectedIndex) return;

                select[0].selectedIndex = newindex;
                container.find('.selected').attr('class','');
                e.target.setAttribute('class','selected');
            }.bind(this));

            container.append(select);
            return container;
        },

        /**
         * Direction (top or bottom) selection form
         * @param {String} current - Current selected value
         * @param {String} probe - Probe name
         * @return The selection container
         */
        directionSelect : function(current,probe){
            var container = $('<span style="display:table-cell;"></span>');
            var direction = $('<select name="reversed" class="hidden"></select>');
            direction.append('<option '+((!current) ? 'selected="selected"': '')+' value="false">Top</option>');
            direction.append('<option '+((current) ? 'selected="selected"': '')+' value="true">Bottom</option>');

            var button = $('<button style="width:4.5em;" class="formButton"></button>');
            var probe = probe;
            button.text((current) ? 'Bottom':'Top');

            button[0].addEventListener('click',function(event){
                event.preventDefault();
                var current = (event.target.parentNode.getElementsByClassName('hidden')[0].value === 'true');
                current = !current;
                var newVal = String(current);
                event.target.parentNode.getElementsByClassName('hidden')[0].value = newVal;
                button.text((current) ? 'Bottom':'Top');

                var scale = this.scales[this.probes[probe].scale];
                var newVal = this.getScale(scale.unit, scale.orient , current, scale.stacked);
                this.probes[probe].scale = newVal;

                var query = {
                    'id': this.id,
                    'conf': {
                        'probes': {}
                    }
                };
                query.conf.probes[probe] = {'scale': newVal};
                //TODO
                query.conf = JSON.stringify(query.conf);
                DashboardManager.savePartData(query);

                this.setDomain(this.data);
                if(!this.scales[scale.name].boundedProbe){
                    DashboardProbes.remove(this.id,false,scale.name);
                    delete this.scales[scale.name];
                }
                this.cleanScales();
                this.redraw();
                
                this.flushPanel();
                this.buildEditPanel();
                var context = this.axis.x2.domain();
                var focus = this.axis.x.domain();
                DashboardProbes.worker.postMessage([8,{
                    'probes': this.probes,
                    'contextTimeline': [context[0].getTime(),context[1].getTime()],
                    'focusTimeline': [focus[0].getTime(),focus[1].getTime()],
                    'mode': this.conf.mode
                },this.id]);

            }.bind(this));

            container.append(button);
            container.append(direction);
            return container;
        },

        /**
         * Direction (top or bottom) selection form for add-probe panel
         * @param {String} current - Current selected value
         * @param {String} probe - Probe name
         * @return The selection container
         */
        directionAddSelect : function(current){
            var container = $('<p class="direction"></p>');
            var select = $('<select name="reversed" class="hidden"></select>');
            select.append('<option '+((!current) ? 'selected="selected"': '')+' value="false">Top</option>');
            select.append('<option '+((current) ? 'selected="selected"': '')+' value="true">Bottom</option>');

            container.append('<button data-value="" '+((!current) ? 'class="selected"': '')+'>top</button>');
            container.append('<button data-value="true" '+((current) ? 'class="selected"': '')+'>bottom</button>');

            container.on('click',function(e){
                e.preventDefault();
                var newval = Boolean(e.target.dataset.value);
                if(newval == select[0].selectedIndex) return;

                select[0].selectedIndex = (newval) ? 1 : 0;
                container.find('.selected').attr('class','');
                e.target.setAttribute('class','selected');
            }.bind(this));

            container.append(select);
            return container;
        },

        /**
         * Type selection form for edit-panel
         * @param {String} current  - Current selected value
         * @param {Boolean} stacked - Stacked state of the current probe
         * @param {String} probe    - Probe name
         * @return The selection container
         */
        typeSelect : function(current,stacked,probe){
            var container = $('<span style="display:table-cell;"></span>');
            var button = $('<button style="width:5em;" class="formButton"></button>');
            var select = $('<select name="type" class="hidden"></select>');
            var values = ['line','area','column'];
            var probe = probe;
            container.append(button);
            container.append(select);
            if(!stacked)
                select.append('<option '+((current === 'line') ? 'selected="selected"': '')+' value="line">Line</option>');
            select.append('<option '+((current === 'area') ? 'selected="selected"': '')+' value="area">Area</option>');
            select.append('<option '+((current === 'column') ? 'selected="selected"': '')+' value="column">Column</option>');
            button.text(function(){
                var result = values[0];
                if(values.indexOf(current) !== -1)
                    result =  values[values.indexOf(current)];
                return result.charAt(0).toUpperCase().concat(result.slice(1));
            });

            button[0].addEventListener('click',function(event){
                event.preventDefault();
                var current = event.target.parentNode.getElementsByClassName('hidden')[0].value;
                var index = values.indexOf(current) + 1;
                if(index === values.length)
                    index = 0;

                var newVal = values[index];
                event.target.parentNode.getElementsByClassName('hidden')[0].value = newVal;
                button.text(newVal.charAt(0).toUpperCase().concat(newVal.slice(1)));

                this.probes[probe].type = newVal;
                var query = {
                    'id': this.id,
                    'conf': {
                        'probes': {}
                    }
                };
                query.conf.probes[probe] = {'type': newVal};
                query.conf = JSON.stringify(query.conf);
                DashboardManager.savePartData(query);
                this.redraw();

                var context = this.axis.x2.domain();
                var focus = this.axis.x.domain();
                DashboardProbes.worker.postMessage([8,{
                    'probes': this.probes,
                    'contextTimeline': [context[0].getTime(),context[1].getTime()],
                    'focusTimeline': [focus[0].getTime(),focus[1].getTime()],
                    'mode': this.conf.mode
                },this.id]);
            }.bind(this));

            return container;
        },

        /**
         * Type selection form for add-panel
         * @param {String} current  - Current selected value
         * @param {Boolean} stacked - Stacked state of the current probe
         * @param {String} probe    - Probe name
         * @return The selection container
         */
        typeAddSelect : function(current){
            var container = $('<p class="type"></p>');
            //var button = $('<button style="width:5em;" class="formButton"></button>');
            var select = $('<select name="type" class="hidden"></select>');
            var values = ['line','area','column'];
            var current = current || 'line';

            for(var v in values){
                var val = values[v];
                select.append('<option '+((current === val) ? 'selected="selected"': '')+' value="'+val+'"></option>');
                container.append('<button '+((current === val) ? 'class="selected"': '')+' data-value="'+val+'" data-index="'+v+'">'+val+'</button>');
            }

            container.on('click',function(e){
                e.preventDefault();
                var newindex = e.target.dataset.index;
                var newval = values[newindex];
                if(!newval || newindex === select[0].selectedIndex) return;

                select[0].selectedIndex = newindex;
                container.find('.selected').attr('class','');
                e.target.setAttribute('class','selected');
            });

            container.append(select);
            return container;
        },

        /**
         * Stacked selection form
         * @param {String} current - Current stacked state
         * @param {String} probe   - Target probe name
         * @return stack checkbox container
         */
        stackCheckbox : function(current,probe){
            var container = $('<span style="display:table-cell;"><input type="checkbox" data-tooltip="Stack/Unstack this probe with other stacked probes" name="stacked" '+((current) ? 'checked="checked"':'')+'/></span>');

            if(probe)
                container[0].getElementsByTagName('input')[0].addEventListener('change',function(event){

                    var scale = this.scales[this.probes[probe].scale];
                    var newVal = event.target.checked;
                    this.probes[probe].stacked = newVal;

                    var query = {
                        'id': this.id,
                        'conf': {
                            'probes': {}
                        }
                    };
                    query.conf.probes[probe] = {'stacked': newVal};
                    query.conf = JSON.stringify(query.conf);
                    DashboardManager.savePartData(query);
                    this.buildScale();
                    this.setDomain(this.data);
                    this.redraw();
                    var context = this.axis.x2.domain();
                    var focus = this.axis.x.domain();
                    DashboardProbes.worker.postMessage([8,{
                        'probes': this.probes,
                        'contextTimeline': [context[0].getTime(),context[1].getTime()],
                        'focusTimeline': [focus[0].getTime(),focus[1].getTime()],
                        'mode': this.conf.mode
                    },this.id]);
                }.bind(this));

            return container;
        },

        /**
         * Return disponible colors list
         */
        getColorsList: function(){
            var colors = ["#7EB26D","#EAB839","#6ED0E0","#EF843C","#E24D42","#1F78C1","#BA43A9","#705DA0",
                          "#508642","#CCA300","#447EBC","#C15C17","#890F02","#0A437C","#6D1F62","#584477",
                          "#B7DBAB","#F4D598","#70DBED","#F9BA8F","#F29191","#82B5D8","#E5A8E2","#AEA2E0",
                          "#629E51","#E5AC0E","#64B0C8","#E0752D","#BF1B00","#0A50A1","#962D82","#614D93",
                          "#9AC48A","#F2C96D","#65C5DB","#F9934E","#EA6460","#5195CE","#D683CE","#806EB7",
                          "#3F6833","#967302","#2F575E","#99440A","#58140C","#052B51","#511749","#3F2B5B",
                          "#E0F9D7","#FCEACA","#CFFAFF","#F9E2D2","#FCE2DE","#BADFF4","#F9D9F9","#DEDAF7"];
            return colors;
        },

        /**
         * Build color selection form
         * @param {String} current - Current selected orient
         * @param {String} probe   - Target probe name
         * @return colors form container
         */
        colorBox : function(current,probe){
            var container = $('<select class="color" name="color" style="background-color: '+current+';display:table-cell;vertical-align: middle; padding: 1px;"></select>');
            var colors = ["#7EB26D","#EAB839","#6ED0E0","#EF843C","#E24D42","#1F78C1","#BA43A9","#705DA0",
                          "#508642","#CCA300","#447EBC","#C15C17","#890F02","#0A437C","#6D1F62","#584477",
                          "#B7DBAB","#F4D598","#70DBED","#F9BA8F","#F29191","#82B5D8","#E5A8E2","#AEA2E0",
                          "#629E51","#E5AC0E","#64B0C8","#E0752D","#BF1B00","#0A50A1","#962D82","#614D93",
                          "#9AC48A","#F2C96D","#65C5DB","#F9934E","#EA6460","#5195CE","#D683CE","#806EB7",
                          "#3F6833","#967302","#2F575E","#99440A","#58140C","#052B51","#511749","#3F2B5B",
                          "#E0F9D7","#FCEACA","#CFFAFF","#F9E2D2","#FCE2DE","#BADFF4","#F9D9F9","#DEDAF7"];

            for(var c in colors)
                container.append('<option '+((current === colors[c]) ? 'selected="selected"': '')+' value="'+colors[c]+'" style="background-color: '+colors[c]+';"></option>');

            container[0].addEventListener('change',function(event){
                var newVal = event.target.value;
                container[0].style.backgroundColor = newVal;
                this.probes[probe].color = newVal;

                var query = {
                    'id': this.id,
                    'conf': {
                        'probes': {}
                    }
                };
                query.conf.probes[probe] = {'color': newVal};
                query.conf = JSON.stringify(query.conf);
                DashboardManager.savePartData(query);
                this.redraw();
                this.legendManager.setColor(probe,newVal);
            }.bind(this));

            return container;
        },

        /**
         * Build color selection form
         * @param {String} current - Current selected orient
         * @param {String} probe   - Target probe name
         * @return colors form container
         */
        colorAddBox : function(current){
            var select = $('<select name="color" class="hidden"></select>');
            var container = $('<p class="color"></p>');
            var colors = this.getColorsList();

            var i = 0;
            for(var c in colors){
                select.append('<option '+((current === colors[c]) ? 'selected="selected"': '')+' value="'+colors[c]+'"></option>');
                container.append('<span '+((current === colors[c]) ? 'class="selected"': '')+' data-index="'+i+'" data-value="'+colors[c]+'" style="background-color: '+colors[c]+';"></span>');
                i++;
            }

            container.on('click',function(e){
                var newcolor = e.target.dataset.value;
                var newindex = e.target.dataset.index;
                if(!newcolor || newindex === select[0].selectedIndex) return;

                container.find('.selected').attr('class','');
                e.target.setAttribute('class','selected');
                select[0].selectedIndex = newindex;
            });

            container.append(select);
            return container;
        },

        /**
         * Remove button
         * @param {String} probe   - Target probe name
         * @return form container
         */
        removeButton : function(probe){
            var container = $('<button class="formButton remove">X</button>');
            container[0].addEventListener('click',function(){
                this.removeProbe(probe);
                this.setDomain(this.data);
                this.cleanScales();
                this.buildAxis();
                this.redraw();
                this.flushPanel();
                this.buildEditPanel();
            }.bind(this));
            return container;
        }
    };

    return DashboardChartForm;
});
