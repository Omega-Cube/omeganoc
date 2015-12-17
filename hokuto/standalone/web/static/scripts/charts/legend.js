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
define(['d3','dashboards.probes'],function(d3,DashboardProbes){

    /**
     * Manage basicchart widget's legends
     */

    /**
     * Legends class
     * @class
     * @param {d3GElement} container - The main container
     * @param {Number} width         - available width
     * @property {d3GElement} container
     * @property {Object} groups         - host groups containers
     * @property {Array} elements        - store legend items.
     * @property {Object} _probes        - { probe_name: elements_index }
     * @property {Number} availableWidth - Total width available
     * @property {Number} currentHeight  - Current height occupied by the container
     * @property {Number} remainingWidth - available space left
     */
    var Legends = function(container,width){
        this.container = container;
        this.groups = {};
        this.elements = [];
        this._probes = {};
        this.availableWidth = width || 0;
        this.currentHeight = 25;
        this.remainingWidth = this.availableWidth;
    };


    /**
     * Set the legend box size
     * @param {Number} width
     * @param {Number} height
     */
    Legends.prototype.setBox = function(width,height){
        this.availableWidth = width;
        if(height)
            this.availableHeight = height;
        return this;
    };

    /**
     * Create a new host-group element
     * @param {String} host - host name
     */
    Legends.prototype.addHostGroup = function(host){
        var container = this.container.append('g')
            .attr('class','legend-group');

        container.append('text')
            .attr('x',0)
            .attr('y',2)
            .attr('font-size',13)
            .attr('font-weight','bold')
            .text(host);

        this.groups[host] = {
            'container': container,
            'width': 0,
            'left': 0,
            'count': 0
        };
    };

    /**
     * Return an existing or a new host group container.
     * @param {String} host - host name
     */
    Legends.prototype.getHostGroup = function(host){
        if(!this.groups[host]) this.addHostGroup(host);
        return this.groups[host];
    };

    /**
     * Add a new legend element
     * @param {Object} data - The probe data (name, color, ...)
     */
    Legends.prototype.addLegend = function(data){
        var host = DashboardProbes.extractHost(data.name);
        var service = data.name.replace(host + '.','');
        var group = this.getHostGroup(host);
        group.count++;
        var container = group.container.append('g')
            .attr('class','legend-item '+data.name)
            .attr('data-host',host);

        container.append('text')
            .attr('class','legend-label')
            .attr('x',5)
            .attr('y',12)
            .attr('fill',data.color)
            .attr('font-size',12)
            .attr('style','cursor:pointer;')
            .text(service.split(ONOC.separator).join('.'));

        var legendValue = container.append('g')
            .attr('transform','translate(0,1)');

        var index = this.elements.push(container);
        this._probes[data.name] = --index;

        return(legendValue.append('text').attr('x',5).attr('y',12));
    };

    /**
     * Update legend's color
     * @param {String} probe - Probe's fullname (host+service)
     * @param {String} color - Color HTML code
     */
    Legends.prototype.setColor = function(probe,color){
        var container = this.elements[this._probes[probe]];
        container.select('.legend-label').attr('fill',color);
    };

    /**
     * Return current container height
     */
    Legends.prototype.getCurrentHeight = function(){
        return (this.currentHeight > 42) ? this.currentHeight + 4 : 42;
    };

    /**
     * Return legend's container
     * @param {String} probe - Probe's name
     */
    Legends.prototype.getProbeContainer = function(probe){
        if(typeof this._probes[probe] === 'undefined') return false;
        return this.elements[this._probes[probe]];
    };

    /**
     * Remove the legend entry
     * @param {String} probe - Probe name
     */
    Legends.prototype.removeLegend = function(probe){
        var container = this.elements[this._probes[probe]];
        var host = DashboardProbes.extractHost(probe);
        var group = this.getHostGroup(host);
        if(container)
            container.remove();
        this.elements[this._probes[probe]] = null;
        delete this._probes[probe];
        group.count--;
        this.redraw();
    };

    /**
     * Set a new width
     */
    Legends.prototype.setNewWidth = function(width){
        this.availableWidth = width;
        this.redraw();
    };

    /**
     * Abstract method
     */
    Legends.prototype.extend = function(){
        //abstract
    }

    /**
     * (Re)draw legends elements.
     * @return false until all elements have been fully drawn, needed to expend legend boxes to the size of their content.
     */
    Legends.prototype.redraw = function(){
        var check = true;
        this.remainingWidth = this.availableWidth;
        this.currentHeight = 25;

        //get all box width
        var left = 0;
        var height = 0;
        var maxHeight = 0;
        for(var host in this.groups){
            var groupHeight = 12 + 13 * this.groups[host].count;
            var totalHeight = height + groupHeight;
            this.groups[host].width = 0;
            this.groups[host].left = left;
            this.groups[host].container.attr('transform','translate('+left+','+height+')');

            if(totalHeight > this.currentHeight) this.currentHeight = totalHeight;
            if(groupHeight > maxHeight) maxHeight = groupHeight;

            var probes = this.groups[host].container.selectAll('.legend-item')[0];
            for(var i = 0;i<this.groups[host].count;i++){
                var boxWidth = probes[i].getElementsByTagName('text')[0].getBoundingClientRect().width + 10;
                if(!boxWidth || boxWidth === 10){
                    check = false;
                    break;
                }
                probes[i].setAttribute('transform','translate(0,'+(8 + 13 * i)+')');
                if(boxWidth > this.groups[host].width) this.groups[host].width = boxWidth;
            }
            if(check){
                left += this.groups[host].width + 65;
                this.remainingWidth-= this.groups[host].width + 65;
                if(this.remainingWidth < 0){
                    this.currentHeight += groupHeight + 15;
                    height+= maxHeight + 15;
                    this.groups[host].container.attr('transform','translate(0,'+height+')');
                    maxHeight = groupHeight;
                    left = this.groups[host].width + 65;
                    this.remainingWidth = this.availableWidth - this.groups[host].width - 65;
                }
            }
        }

        if(check){
            for(var i =0, len = this.elements.length;i<len;i++){
                if(!this.elements[i]) continue;
                var host = this.elements[i].attr('data-host');
                this.elements[i].select('g').attr('transform','translate('+this.groups[host].width+',1)');
            }
        }

        return check;
    };

    return Legends;
});
