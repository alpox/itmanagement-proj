define('app',['exports', 'aurelia-framework', 'aurelia-pal', './data-service', 'd3'], function (exports, _aureliaFramework, _aureliaPal, _dataService, _d) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.App = undefined;

  var d3 = _interopRequireWildcard(_d);

  function _interopRequireWildcard(obj) {
    if (obj && obj.__esModule) {
      return obj;
    } else {
      var newObj = {};

      if (obj != null) {
        for (var key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key];
        }
      }

      newObj.default = obj;
      return newObj;
    }
  }

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  var _dec, _class;

  var App = exports.App = (_dec = (0, _aureliaFramework.inject)(_dataService.DataService), _dec(_class = function () {
    function App(dataService) {
      _classCallCheck(this, App);

      this.dataService = dataService;
    }

    App.prototype.attached = function attached() {
      var _this = this;

      Promise.all([this.dataService.fetchRepositories(), this.dataService.fetchUsers(), this.dataService.fetchRels()]).then(function (result) {
        _this.repositories = result[0];
        _this.users = result[1];
        _this.rels = result[2];


        _this.drawGraph();
      });
    };

    App.prototype.transform = function transform(data, type, idFunc, includeFunc) {
      return data.map(function (entry) {
        var includes = includeFunc(entry) || {};
        var transformed = {
          id: idFunc(entry),
          type: type
        };
        Object.assign(transformed, includes);
        return transformed;
      });
    };

    App.prototype.scale = function scale(commits, num, max, min) {
      var n_max = d3.max(commits);

      commits = commits.map(function (c) {
        return Math.pow(Math.log(c), 3.15);
      });
      num = Math.pow(Math.log(num), 3.15);

      return (max - min) * (num / n_max) + min;
    };

    App.prototype.findNeighbours = function findNeighbours(node, rels) {
      return rels.filter(function (rel) {
        return rel.target.id == node.id || rel.source.id == node.id;
      }).map(function (rel) {
        return rel.target.id === node.id && rel.source || rel.source.id === node.id && rel.target;
      });
    };

    App.prototype.sanitizeId = function sanitizeId(str) {
      return "id" + str.replace(/["'@\/\-\.# \(\)]/g, '');
    };

    App.prototype.drawGraph = function drawGraph() {
      var _this2 = this;

      var self = this;
      var links = [];
      var rels = this.rels;
      var width = Number.parseInt(d3.select("svg").style("width"));
      var height = Number.parseInt(d3.select("svg").style("height"));
      var graph = d3.select("#graph");
      var app = this;

      _aureliaFramework.DOM.querySelectorAll(".spinner").forEach(function (s) {
        return s.style.display = "block";
      });

      graph.selectAll("*").remove();

      var repositories = this.transform(this.repositories, 'repo', function (entry) {
        return entry.name;
      }, function (entry) {
        return { n_commits: entry.n_commits };
      });

      var users = this.transform(this.users, 'user', function (entry) {
        return entry.hashed_email + entry.name;
      }, function (entry) {
        return {
          any_commit_url: entry.any_commit_url,
          n_commits: entry.n_commits,
          name: entry.name };
      });

      var nodeData = repositories.concat(users);

      rels = this.rels.filter(function (rel) {
        return nodeData.some(function (node) {
          return node.id == rel.repository_name;
        }) && nodeData.some(function (node) {
          return node.id == rel.user_hashed_email + rel.user_name;
        });
      });

      var commits = rels.map(function (rel) {
        return rel.n_commits;
      }).sort(function (a, b) {
        return a - b;
      });

      for (var i = 0; i < rels.length; i++) {
        links.push({
          source: rels[i].repository_name,
          target: rels[i].user_hashed_email + rels[i].user_name,
          value: rels[i].n_commits });
      }

      var tooltip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);

      var link = graph.append("g").attr("x", width / 2).attr("y", height / 2).attr("class", "links").selectAll("line").data(links).enter().append("line").attr("stroke", "#000").attr("stroke-width", function (d) {
        return _this2.scale(commits, d.value, 4, 2);
      }).attr("opacity", function (d) {
        return _this2.scale(commits, d.value, 1, 0.3);
      });

      var node = graph.append("g").attr("class", "nodes").selectAll("circle").data(nodeData).enter().append("circle").attr("class", "node").attr("id", function (d) {
        return _this2.sanitizeId(d.id);
      }).attr("r", function (d) {
        return d.n_commits ? d.type == 'repo' ? _this2.scale(commits, d.n_commits, 15, 4) : _this2.scale(commits, d.n_commits, 6, 3) : 3;
      }).attr("stroke", "#333").attr("fill", function (d) {
        return d.type == 'repo' ? "#00BCD4" : "#FF9800";
      }).call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended)).on("mouseover", function (d) {
        d3.event.stopPropagation();

        tooltip.transition().style("opacity", .9);

        switch (d.type) {
          case 'repo':
            tooltip.html(d.id + '<br/>Commits: ' + d.n_commits);
            break;
          case 'user':
            tooltip.html(d.name + '<br/>Commits: ' + d.n_commits);
            break;
        }

        highlightNeighbours(d);
      }).on("mouseout", function (d) {
        tooltip.transition().style("opacity", 0);
        unhighlightNeighbours(d);
      }).on("click", function (d) {
        switch (d.type) {
          case 'repo':
            window.open('http://github.com/' + d.id, '_blank');break;
          case 'user':
            app.dataService.fetchUserInfo(d.any_commit_url).then(function (user) {
              return window.open(user.author.html_url, '_blank');
            });break;
        }
      });

      var simulation = d3.forceSimulation().force("charge", d3.forceManyBody().strength(-4)).force("link", d3.forceLink().strength(0.5).id(function (d) {
        return d.id;
      })).force("center", d3.forceCenter(width / 2, height / 2)).force("collide", d3.forceCollide(function (d) {
        return d.type == 'repo' ? _this2.scale(commits, d.n_commits, 15, 4) + 1 : _this2.scale(commits, d.n_commits, 6, 3) + 1;
      })).force("x", d3.forceX()).force("y", d3.forceY());

      simulation.nodes(nodeData).on("tick", ticked);

      simulation.force("link").links(links);

      var time = Date.now();
      var tick = 3000;
      var lastTickTime = Date.now();

      function ticked() {
        if (Date.now() - lastTickTime < tick) return;
        lastTickTime = Date.now();
        if (Date.now() - time >= 20000) {
          _aureliaFramework.DOM.querySelectorAll(".spinner").forEach(function (s) {
            return s.style.display = "none";
          });
          simulation.stop();
        }

        link.attr("x1", function (d) {
          return d.source.x;
        }).attr("y1", function (d) {
          return d.source.y;
        }).attr("x2", function (d) {
          return d.target.x;
        }).attr("y2", function (d) {
          return d.target.y;
        });

        node.attr("cx", function (d) {
          return d.x;
        }).attr("cy", function (d) {
          return d.y;
        });
      }

      function highlightNeighbours(node) {
        var neighbours = self.findNeighbours(node, links);

        [node].concat(neighbours).forEach(function (n) {
          var highlightColor = n.type == 'repo' ? "#3de8ff" : "#ffca7a";
          graph.select('#' + self.sanitizeId(n.id)).attr("style", 'fill:' + highlightColor);
        });
      }

      function unhighlightNeighbours(node) {
        var neighbours = self.findNeighbours(node, links);

        [node].concat(neighbours).forEach(function (n) {
          var color = n.type == 'repo' ? "#00BCD4" : "#FF9800";
          graph.select('#' + self.sanitizeId(n.id)).attr("style", 'fill:' + color);
        });
      }

      function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
      }

      function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
    };

    return App;
  }()) || _class);
});
define('data-service',['exports', 'aurelia-framework', 'aurelia-http-client'], function (exports, _aureliaFramework, _aureliaHttpClient) {
    'use strict';

    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.DataService = undefined;

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    var _dec, _class;

    var username = "gitPuller1";
    var password = "64b115ab7af63aa80bbd62449455b115634aca29";

    var userHash = btoa(username + ':' + password);

    var DataService = exports.DataService = (_dec = (0, _aureliaFramework.inject)(_aureliaHttpClient.HttpClient), _dec(_class = function () {
        function DataService(itprojClient, githubClient) {
            _classCallCheck(this, DataService);

            itprojClient = new _aureliaHttpClient.HttpClient().configure(function (x) {
                x.withBaseUrl('http://beta.api.itprojektmanagement.rafaelkallis.com/');
            });
            githubClient = new _aureliaHttpClient.HttpClient().configure(function (x) {
                x.withHeader('Accept', 'application/vnd.github.v3+json');
                x.withHeader('Authorization', 'Basic ' + userHash);
                x.withBaseUrl('https://api.github.com/');
            });
            this.itprojClient = itprojClient;
            this.githubClient = githubClient;
        }

        DataService.prototype.fetchRepositories = function fetchRepositories() {
            return this.itprojClient.get('repositories').then(function (res) {
                return JSON.parse(res.response);
            }).catch(console.log);
        };

        DataService.prototype.fetchUsers = function fetchUsers() {
            return this.itprojClient.get('users').then(function (res) {
                return JSON.parse(res.response);
            }).catch(console.log);
        };

        DataService.prototype.fetchRels = function fetchRels() {
            return this.itprojClient.get('rels').then(function (res) {
                return JSON.parse(res.response);
            }).catch(console.log);
        };

        DataService.prototype.fetchRepositoryInfo = function fetchRepositoryInfo(repo) {
            return this.githubClient.get('repos/' + repo).then(function (res) {
                return JSON.parse(res.response);
            }).catch(console.log);
        };

        DataService.prototype.fetchUserInfo = function fetchUserInfo(url) {
            return this.githubClient.get(url).then(function (res) {
                return JSON.parse(res.response);
            }).catch(console.log);
        };

        DataService.prototype.mockRels = function mockRels() {
            return [{ "repository_name": "j0nas/deichman2d", "user_hashed_email": "bc5dacad0f818a2881e66b0997924ba3c6f12486", "n_commits": 13 }, { "repository_name": "j0nas/deichman2d", "user_hashed_email": "7cafebc90fe6be049cb9a2b636af619dfa9bae3b", "n_commits": 7 }, { "repository_name": "j0nas/deichman2d", "user_hashed_email": "8f1b1b0f7455593a23eeb283459f8e51cd2441b9", "n_commits": 20 }, { "repository_name": "j0nas/deichman2d", "user_hashed_email": "13724df640efce8bf774c44e42fc6e27264de695", "n_commits": 15 }, { "repository_name": "j0nas/deichman2d", "user_hashed_email": "c72f4c1d52c160086195ed01f658663cef237767", "n_commits": 2 }, { "repository_name": "j0nas/deichman2d", "user_hashed_email": "941ae60cfc36bce0ea1c78906cb3d66986e44911", "n_commits": 13 }, { "repository_name": "Homebrew/homebrew-core", "user_hashed_email": "74f925d2ded89b0e45b91172540ca22cf6163d0f", "n_commits": 4 }, { "repository_name": "Homebrew/homebrew-core", "user_hashed_email": "2c9d0ea31f1b9470b26561a2ab55b9686cd01de2", "n_commits": 1 }, { "repository_name": "Homebrew/homebrew-core", "user_hashed_email": "aa7ada780dbf2380b352a70aaa93ceb8b17028b0", "n_commits": 65 }, { "repository_name": "Homebrew/homebrew-core", "user_hashed_email": "8b27323fb6d62f5e86361e8f8ff85a3c0b4ea967", "n_commits": 1 }, { "repository_name": "rouault/gdal_coverage", "user_hashed_email": "d8205f621e59e021912ca64710aac70d69f0e24a", "n_commits": 64 }, { "repository_name": "rouault/gdal_coverage", "user_hashed_email": "2b28a688166809707538b1e0b133da3d48ceb948", "n_commits": 8 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "110b37d45ddda9f73d754416365dfae63927f12d", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "6b255f1209c228abfd5da528e787eee7a31bf652", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "344bea3720080f4bdd9a4426f06e5ab01b96bbfb", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "e11ac465acb63ba34b2760c15a5e9874aa05e685", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "47bc6657766d30b03d03ddcf00c3effaee52e71a", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "1cd424918902c1dbc16c61ea09f30b31f6c2f0e9", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "d3629432f14a71b62e796d32d075121c69cf67de", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "4d5b87db536b0fdcf99bbc489362ee83ff8bf6c6", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "9d938db41bf7d07f88e8d8adba89b477eaafa4d6", "n_commits": 3 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "96f164ad4d9b2b0dacf8ebee2bb1eeb3aa69adf1", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "2ca028346d1d172bdf6d5bd55544812ec8ee16e2", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "ab3c2931970baa67c6d76cdeb719744d873e09ef", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "16a8e2b698c5c697ded1fd521ae22d7727c03212", "n_commits": 5 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "7d288e6836572ae72b1427e06e061fd492aa8050", "n_commits": 6 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "f2687d141d6df003196c0c086f0a189634ba4557", "n_commits": 5 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "83a6da1a0f6a5e3ab62b8666cc788eee7a3d8b6f", "n_commits": 3 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "a4443662f8045c616ffde65288e324795912538a", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "ad6aae26973f3c04691b34ada9495b8b91649d04", "n_commits": 2 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "90c18e1045222b78888c1c4df7c6ddac3437abd3", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "038c340fe78831dc717b6cb1539137cc96c2aa29", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "8800578b51f022c8d8adb9606a8b3db4fedbdac6", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "7f3b563762cedf85ff9ce23cb18b85fca5cd6be1", "n_commits": 7 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "14db504d4cd3201da0bb52691e3113891ce88197", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "631d11d9fe908fc8f04b5865032c3043cb48fdfb", "n_commits": 7 }, { "repository_name": "llvm-project/llvm-project-submodule", "user_hashed_email": "f49f2a5e660787beb1d0033eaaa9f0d533955c60", "n_commits": 24 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "110b37d45ddda9f73d754416365dfae63927f12d", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "6b255f1209c228abfd5da528e787eee7a31bf652", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "344bea3720080f4bdd9a4426f06e5ab01b96bbfb", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "e11ac465acb63ba34b2760c15a5e9874aa05e685", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "47bc6657766d30b03d03ddcf00c3effaee52e71a", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "1cd424918902c1dbc16c61ea09f30b31f6c2f0e9", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "d3629432f14a71b62e796d32d075121c69cf67de", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "4d5b87db536b0fdcf99bbc489362ee83ff8bf6c6", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "9d938db41bf7d07f88e8d8adba89b477eaafa4d6", "n_commits": 3 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "96f164ad4d9b2b0dacf8ebee2bb1eeb3aa69adf1", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "2ca028346d1d172bdf6d5bd55544812ec8ee16e2", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "ab3c2931970baa67c6d76cdeb719744d873e09ef", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "16a8e2b698c5c697ded1fd521ae22d7727c03212", "n_commits": 5 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "7d288e6836572ae72b1427e06e061fd492aa8050", "n_commits": 6 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "f2687d141d6df003196c0c086f0a189634ba4557", "n_commits": 5 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "83a6da1a0f6a5e3ab62b8666cc788eee7a3d8b6f", "n_commits": 3 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "a4443662f8045c616ffde65288e324795912538a", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "ad6aae26973f3c04691b34ada9495b8b91649d04", "n_commits": 2 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "90c18e1045222b78888c1c4df7c6ddac3437abd3", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "038c340fe78831dc717b6cb1539137cc96c2aa29", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "8800578b51f022c8d8adb9606a8b3db4fedbdac6", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "7f3b563762cedf85ff9ce23cb18b85fca5cd6be1", "n_commits": 7 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "14db504d4cd3201da0bb52691e3113891ce88197", "n_commits": 1 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "631d11d9fe908fc8f04b5865032c3043cb48fdfb", "n_commits": 7 }, { "repository_name": "llvm-project/llvm-project", "user_hashed_email": "f49f2a5e660787beb1d0033eaaa9f0d533955c60", "n_commits": 24 }, { "repository_name": "ceejbot/jthoober", "user_hashed_email": "5613ca5bdc82051dbc3f75fe895cef0e40844bd3", "n_commits": 2 }, { "repository_name": "ceejbot/jthoober", "user_hashed_email": "5bdcd3c0d4d24ae3e71b3b452a024c6324c7e4bb", "n_commits": 77 }, { "repository_name": "gonsakon/HolidayAPI", "user_hashed_email": "50dca4ed57e4be4cd6ce4ae6274295c99e0f9e78", "n_commits": 79 }, { "repository_name": "jasoncalabrese/indy-e4b", "user_hashed_email": "68c46a606457643eab92053c1c05574abb26f861", "n_commits": 81 }, { "repository_name": "direwolf-github/my-app", "user_hashed_email": "32d4b6e6dbf7cca2c4ef688c831ef2b8e1721fae", "n_commits": 81 }, { "repository_name": "WilliamBundy/rituals-game", "user_hashed_email": "ef8a458f72ea410a729d65a6795b289d6e5f16ce", "n_commits": 90 }, { "repository_name": "derekcchan/derekcchan.github.io", "user_hashed_email": "a216c04a42f93c3e1a9b0a3544fd3f541b41a7db", "n_commits": 97 }, { "repository_name": "miatribe/pipvpspy", "user_hashed_email": "333a0a56843ecfbd7d1f247ae3587f84236536bc", "n_commits": 98 }, { "repository_name": "dit-inc-us/Content", "user_hashed_email": "1a73af9e7ae00182733b2292511b814be66f065f", "n_commits": 100 }, { "repository_name": "nathanbl/date-info", "user_hashed_email": "7555aa909aeefc4b48a22650b82530052cae90a6", "n_commits": 100 }, { "repository_name": "everypolitician-scrapers/romanian-parliament", "user_hashed_email": "61614e6008a3ae647761efae8e6f40d3640d5e86", "n_commits": 100 }, { "repository_name": "marcomow/keklv", "user_hashed_email": "33bdcd680497cab5d61957b985513fceb724a953", "n_commits": 101 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "2a7e8f8b0d692d1e0b5424c4413307da38476423", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "8f999d7dfae48e670d94b027d3cb84bc00ed943c", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "742cc7da48fa788d384ec77ccfb9a4657661404c", "n_commits": 14 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "f33139e9ff8e43a3b958b7d51460544e7a9d4f55", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "bba47ad64dee34c4d300854848a6414e05073f51", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "67664aa6ce912e0947777da9284428078a1d7954", "n_commits": 2 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "b65714dc99ca4275366631333f72ea351a4fc229", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "0bddf0d781aece727dabd7b493b87d152d652a87", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "5a44e6ed17c4e196d25b9ca3d47678de1c8a63ce", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "b8faca8f45c84d5881cc3a71a4ee4299af07e530", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "2a852a96f725fe2d9417bad4de79d50ac8f32d28", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "4518c7bd309b7828292441ffce16ced7cb33eedd", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "ecd1f14f7c1c6dc7a40210bdcc3810e0107ecbc8", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "596727c8a0ea4db3ba2ceceedccbacd3d7b371b8", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "a8e70ce470c554a6f43803df5187177f222204a8", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "b3a421eb3be2513778326c2c11b780145dbdf96b", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "368d0007e4626f70737d16df5e49ed8806b98c3f", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "d6e1285e1c84d3d5885c2124fdacc780e9fc0a94", "n_commits": 3 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "b3eef4c91db124096f17b389c40733c06b7d5036", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "88a1d58bf22a647dce58dd91f9595600dceabba9", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "7864bb1e0e12322ea18ea731d051b95b75140567", "n_commits": 6 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "d36de655fd7d73924ee153ac87b341a5b17183d0", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "ff359ca7f9aedbb05cd6aa3d17e7b3b3ad3b25c9", "n_commits": 4 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "287e02744ae7c802bbb99a60be19e5052bdd29c3", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "fbe788dcd509b324901fbdfe505a4d610d560569", "n_commits": 4 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "5b3c147a15c322255c2e37e47e0b5e0d1c8fc7bc", "n_commits": 10 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "2c98d18550b6e94ee93faf6d92fa2bedb58842c9", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "bb05168246ed1a6b66d0e7b1ffb0c5e3707764ca", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "181323dd666a182bc2d953e52d0ac3ab54cd8391", "n_commits": 1 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "9deae027791a36ed810389301f71a062117d47d6", "n_commits": 38 }, { "repository_name": "Team-Huawei/android_kernel_huawei_msm8909", "user_hashed_email": "4452d71687b6bc2c9389c3349fdc17fbd73b833b", "n_commits": 1 }, { "repository_name": "shapiromatron/hawc", "user_hashed_email": "dd25cd0ca3ad8c14a6694cbb8a3808d02f48438c", "n_commits": 107 }, { "repository_name": "KammiO/kammio.github.io", "user_hashed_email": "ec53c38edc8b8930f4ee038d3435d54cd7b59375", "n_commits": 112 }, { "repository_name": "screwdriver-cd-test/functional-git", "user_hashed_email": "191236721bc8dcec4dcb6b41005498bd0792e640", "n_commits": 115 }, { "repository_name": "ryanniehaus/open_source_package_builder", "user_hashed_email": "0968282e15ed9e224ab3a4b5d1973c8f7097dcea", "n_commits": 120 }, { "repository_name": "flameserver/downloads", "user_hashed_email": "d276d7a9ce588f1d810695ab45b46b32e405a054", "n_commits": 120 }, { "repository_name": "yaks-all-the-way-down/hubpress.github.io", "user_hashed_email": "8bb88644350361b87087e40823c867b8b5923f0f", "n_commits": 122 }, { "repository_name": "the-domains/rgv-guide", "user_hashed_email": "c71e7261d37a4f6ae4cfb0cbd79081310a237e67", "n_commits": 68 }, { "repository_name": "the-domains/rgv-guide", "user_hashed_email": "91cf50d31a2a665c4bd7c7e6c018428ec29687a5", "n_commits": 65 }, { "repository_name": "Door43/d43-en", "user_hashed_email": "62eb0db178518a8376b23676c2639eb2732c0be8", "n_commits": 135 }, { "repository_name": "yann-morin-1998/buildroot", "user_hashed_email": "165ff8434110f159a74f62730197c47aa03ad0c4", "n_commits": 1 }, { "repository_name": "yann-morin-1998/buildroot", "user_hashed_email": "2c0dc4fd93ee64b39355b29dd45c320cfb3c201e", "n_commits": 1 }, { "repository_name": "yann-morin-1998/buildroot", "user_hashed_email": "cbdb0cc7f3f5b4be81a75fa7242590e3e9882e1e", "n_commits": 1 }, { "repository_name": "yann-morin-1998/buildroot", "user_hashed_email": "b375a36861a21dce61868a5a9b415811d17b4e97", "n_commits": 148 }, { "repository_name": "jasoncalabrese/indy-e1-cgm7", "user_hashed_email": "68c46a606457643eab92053c1c05574abb26f861", "n_commits": 155 }, { "repository_name": "newstools/newstools_article_index", "user_hashed_email": "64b2b6d12bfe4baae7dad3d018f8cbf6b0e7a044", "n_commits": 157 }, { "repository_name": "the-domains/besiana", "user_hashed_email": "af042b13840a2b8ecdb0cfc2dcbfa9a25301163c", "n_commits": 77 }, { "repository_name": "the-domains/besiana", "user_hashed_email": "c71e7261d37a4f6ae4cfb0cbd79081310a237e67", "n_commits": 81 }, { "repository_name": "MarkEWaite/jenkins-bugs", "user_hashed_email": "139b5d1fe0e58763c95ffde6986245b6c7f5ec89", "n_commits": 41 }, { "repository_name": "MarkEWaite/jenkins-bugs", "user_hashed_email": "d95b56ce41a2e1ac4cecdd398defd7414407cc08", "n_commits": 120 }, { "repository_name": "BrewTestBot/homebrew-core", "user_hashed_email": "fbd54dbbcf9e596abad4ccdc4dfc17f80ebeaee2", "n_commits": 20 }, { "repository_name": "BrewTestBot/homebrew-core", "user_hashed_email": "74f925d2ded89b0e45b91172540ca22cf6163d0f", "n_commits": 4 }, { "repository_name": "BrewTestBot/homebrew-core", "user_hashed_email": "2c9d0ea31f1b9470b26561a2ab55b9686cd01de2", "n_commits": 1 }, { "repository_name": "BrewTestBot/homebrew-core", "user_hashed_email": "8b27323fb6d62f5e86361e8f8ff85a3c0b4ea967", "n_commits": 1 }, { "repository_name": "BrewTestBot/homebrew-core", "user_hashed_email": "aa7ada780dbf2380b352a70aaa93ceb8b17028b0", "n_commits": 142 }, { "repository_name": "xheomar/xheomar.github.io", "user_hashed_email": "0ca96d224e8044b8ba18d5af3a49ac6cdcba8fbe", "n_commits": 207 }, { "repository_name": "ingenue/hunter-cache", "user_hashed_email": "0600fd3c3898444a4e59315616cd806a2be266f0", "n_commits": 223 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1", "user_hashed_email": "c5ef40b91c2665278acd9e1874a07c99c0b164fd", "n_commits": 251 }, { "repository_name": "ros-drivers-gbp/pointgrey_camera_driver-release", "user_hashed_email": "2c71a55262ba6130c1ed1005a94c6b15a81b9019", "n_commits": 282 }, { "repository_name": "toxtli/dailypush", "user_hashed_email": "24bf68e341ce0fbd9259a5d51feed79682ea4eba", "n_commits": 299 }, { "repository_name": "mikestebbins/openapsdev", "user_hashed_email": "4772d34e644b52ba3fd70eca28753d74824d83c4", "n_commits": 346 }, { "repository_name": "jasoncalabrese/indy-e1h", "user_hashed_email": "68c46a606457643eab92053c1c05574abb26f861", "n_commits": 425 }, { "repository_name": "CodePipeline-Test/feature-tests", "user_hashed_email": "c0a934bb7f5e6ff0b46c9cf35d69fc1d86ace91c", "n_commits": 438 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "045e46f151ba0f76023c851f68c13c434c412422", "n_commits": 3 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "0b2f7501dfd549ae8026aaa6ba9cc9b3b6307cd9", "n_commits": 10 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "146b865580f1cbe78f97211de9bee7b3288eee2b", "n_commits": 2 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "284427851f9f1fafd324039fdee42b63352fdd90", "n_commits": 8 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "1fc905d067cc16df41e6322380796a4d833a5022", "n_commits": 1 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "9f8a2389a20ca0752aa9e95093515517e90e194c", "n_commits": 16 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "04547db51792014fdd1b55c04bcece9dc3cab690", "n_commits": 20 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "51f856fad1bae2de74b1d02839ecf002f2a63fe5", "n_commits": 9 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "36f780fdbda5b2b2ce85c9ebb57086d1880ae757", "n_commits": 20 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "ff7328b41963cb2a7050fbab536e4bac8c820b32", "n_commits": 1 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "21fcf19581dae4b7332a6adc7026744037b6fba5", "n_commits": 1 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "2e8142d82ecfe3f3e5bdef13577984d3f058cb54", "n_commits": 2 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "68ec43140b6f92234dc85f2523f8eefd9946767d", "n_commits": 42 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "89512d63e80a7cdf17b450bfbe453e8c3708ac8b", "n_commits": 2 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "538f1f5ea53fbfb45b3721fc48dcd5a7827bd915", "n_commits": 96 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "31b4bf6213854a26a9799707ef5a51cafbde3057", "n_commits": 10 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "12dea96fec20593566ab75692c9949596833adc9", "n_commits": 2 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "371fb2cd193b20c09c0d7179be8520df64ad21d3", "n_commits": 61 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "d5aa170e875913b89d169c57b96b452548fabfff", "n_commits": 115 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "c6e88b6afb8bf5890781d8633ca4b7b9a806a516", "n_commits": 10 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "3f2ecdef3c6c3b614e34115a95b25944cfa4198a", "n_commits": 19 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "6eb0c61201a96afc99cbf180f1c8d93c0a9fd8c8", "n_commits": 28 }, { "repository_name": "TonyMiloro/Pr-cticas-Preprofesionales", "user_hashed_email": "0a00ae03c9edd21d50a229f9fa1f98d9b3912b9e", "n_commits": 16 }, { "repository_name": "everypolitician-scrapers/mexico-diputados-2015", "user_hashed_email": "61614e6008a3ae647761efae8e6f40d3640d5e86", "n_commits": 495 }, { "repository_name": "KenanSulayman/heartbeat", "user_hashed_email": "9176253dfc0bc82671a5e984646605f93319147a", "n_commits": 550 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1-zhcn", "user_hashed_email": "c5ef40b91c2665278acd9e1874a07c99c0b164fd", "n_commits": 2 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1-zhcn", "user_hashed_email": "5fb14e02dbe8d68df66f2d0999a4f829091cc16b", "n_commits": 585 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1-dede", "user_hashed_email": "c5ef40b91c2665278acd9e1874a07c99c0b164fd", "n_commits": 2 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1-dede", "user_hashed_email": "5fb14e02dbe8d68df66f2d0999a4f829091cc16b", "n_commits": 586 }, { "repository_name": "teku45/Web-DROP", "user_hashed_email": "030199bfc28d1fad7596105a92fdbaabcf8bfa5e", "n_commits": 598 }, { "repository_name": "ros-gbp/common_msgs-release", "user_hashed_email": "22715502305f5acc3bd5bf22a9c406e70a1e1348", "n_commits": 614 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1-handback", "user_hashed_email": "5fb14e02dbe8d68df66f2d0999a4f829091cc16b", "n_commits": 585 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1-handback", "user_hashed_email": "c5ef40b91c2665278acd9e1874a07c99c0b164fd", "n_commits": 180 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1-handoff", "user_hashed_email": "5fb14e02dbe8d68df66f2d0999a4f829091cc16b", "n_commits": 732 }, { "repository_name": "OpenLocalizationTestOrg/ol-test1-handoff", "user_hashed_email": "c5ef40b91c2665278acd9e1874a07c99c0b164fd", "n_commits": 38 }, { "repository_name": "firehol/blocklist-ipsets", "user_hashed_email": "4bf35f37a90e723b5f0a9024a7be0ec8a5176069", "n_commits": 1176 }, { "repository_name": "api-evangelist/monitoring", "user_hashed_email": "59bd0a3ff43b32849b319e645d4798d8a5d1e889", "n_commits": 6 }, { "repository_name": "api-evangelist/monitoring", "user_hashed_email": "ef6030070d6c28a2190c9f08f860c771114f20e3", "n_commits": 2096 }];
        };

        DataService.prototype.mockUsers = function mockUsers() {
            return [{ "hashed_email": "bc5dacad0f818a2881e66b0997924ba3c6f12486", "any_commit_sha": "829fc25e2ca48558c97b56a3f7dc6744e95088f0" }, { "hashed_email": "7cafebc90fe6be049cb9a2b636af619dfa9bae3b", "any_commit_sha": "09e9fe6f205de36ede8e2898957b470de86401e9" }, { "hashed_email": "8f1b1b0f7455593a23eeb283459f8e51cd2441b9", "any_commit_sha": "8881239759c70f8c8168adf8eab151c8cd012893" }, { "hashed_email": "13724df640efce8bf774c44e42fc6e27264de695", "any_commit_sha": "cc8cbed07211423a4698f615c4df87cb294f3ce2" }, { "hashed_email": "c72f4c1d52c160086195ed01f658663cef237767", "any_commit_sha": "b411436513c5e5b3a2ca6584468e2c99f3922b74" }, { "hashed_email": "941ae60cfc36bce0ea1c78906cb3d66986e44911", "any_commit_sha": "094714905e8936ffcc0b5b66ba8d5f76cb3f987c" }, { "hashed_email": "74f925d2ded89b0e45b91172540ca22cf6163d0f", "any_commit_sha": "983486afa8b3f1b789f4818c1c73de76fa4a3cff" }, { "hashed_email": "2c9d0ea31f1b9470b26561a2ab55b9686cd01de2", "any_commit_sha": "a9c9234b1101c00dde994af4165e055a0c2952b2" }, { "hashed_email": "aa7ada780dbf2380b352a70aaa93ceb8b17028b0", "any_commit_sha": "864c79d279058649f8b69de6fa558aa784ec1b43" }, { "hashed_email": "8b27323fb6d62f5e86361e8f8ff85a3c0b4ea967", "any_commit_sha": "5c77152f0f51bb068b3b4abf42a423a94c936209" }, { "hashed_email": "d8205f621e59e021912ca64710aac70d69f0e24a", "any_commit_sha": "65b20e4a430fc4a96349e31f39a6fc782c650713" }, { "hashed_email": "2b28a688166809707538b1e0b133da3d48ceb948", "any_commit_sha": "b8c52d2a2af592fb8e92daea586d9f9fdcc120c7" }, { "hashed_email": "110b37d45ddda9f73d754416365dfae63927f12d", "any_commit_sha": "c426d159db74bd50011e0a857264de7951e72599" }, { "hashed_email": "6b255f1209c228abfd5da528e787eee7a31bf652", "any_commit_sha": "5eb6bd135ca0aa2afe9d841e3615108aad4e6fb1" }, { "hashed_email": "344bea3720080f4bdd9a4426f06e5ab01b96bbfb", "any_commit_sha": "1e270c0e39954812e0a6e75edce4c92c59c26756" }, { "hashed_email": "e11ac465acb63ba34b2760c15a5e9874aa05e685", "any_commit_sha": "01565bb849c67e38a974888def2d0ca5d4a04381" }, { "hashed_email": "47bc6657766d30b03d03ddcf00c3effaee52e71a", "any_commit_sha": "d07cb7be44ff35768dbbe4646d4e54faa9f2d4d1" }, { "hashed_email": "1cd424918902c1dbc16c61ea09f30b31f6c2f0e9", "any_commit_sha": "f2628267be6dff3025d822fb584d4adfdc2abb7b" }, { "hashed_email": "d3629432f14a71b62e796d32d075121c69cf67de", "any_commit_sha": "646c2e4dd0a440fdf97bec39e00a7d8ab4df931a" }, { "hashed_email": "4d5b87db536b0fdcf99bbc489362ee83ff8bf6c6", "any_commit_sha": "fd1e0beb940393443b0332bda577e86aa6ad7880" }, { "hashed_email": "9d938db41bf7d07f88e8d8adba89b477eaafa4d6", "any_commit_sha": "64e9e2906b3c31968194921a8f15e6bf80618129" }, { "hashed_email": "96f164ad4d9b2b0dacf8ebee2bb1eeb3aa69adf1", "any_commit_sha": "a48abb174c2635bc2d6dee9c214e96eeee27cde3" }, { "hashed_email": "2ca028346d1d172bdf6d5bd55544812ec8ee16e2", "any_commit_sha": "da4e5afb2d20eefe5ec22e3e796805f53dea5851" }, { "hashed_email": "ab3c2931970baa67c6d76cdeb719744d873e09ef", "any_commit_sha": "4f1074c5c5765fdd88f87c68acb88074c89d12f2" }, { "hashed_email": "16a8e2b698c5c697ded1fd521ae22d7727c03212", "any_commit_sha": "268332e4bb75b7d5798b6275d510206404bdcd51" }, { "hashed_email": "7d288e6836572ae72b1427e06e061fd492aa8050", "any_commit_sha": "d317b1c7de4bdb267caa37645b3c51686ff84935" }, { "hashed_email": "f2687d141d6df003196c0c086f0a189634ba4557", "any_commit_sha": "bfeffe139a145d5df5932b4b6231488bd7afe0ad" }, { "hashed_email": "83a6da1a0f6a5e3ab62b8666cc788eee7a3d8b6f", "any_commit_sha": "61a761d90b5f62e4d3656c4a4cdf05ca49732c73" }, { "hashed_email": "a4443662f8045c616ffde65288e324795912538a", "any_commit_sha": "c938bbabe400013f77d26a34c7aed6935e0ef8e0" }, { "hashed_email": "ad6aae26973f3c04691b34ada9495b8b91649d04", "any_commit_sha": "360eade31eb0f2f87b721297143a53ffaa8482d0" }, { "hashed_email": "90c18e1045222b78888c1c4df7c6ddac3437abd3", "any_commit_sha": "140a6c7eca07f7caa498d804661822f88327ed2e" }, { "hashed_email": "038c340fe78831dc717b6cb1539137cc96c2aa29", "any_commit_sha": "da0edfe0a517ea8cfc3d2973e14eb5ef6247cce1" }, { "hashed_email": "8800578b51f022c8d8adb9606a8b3db4fedbdac6", "any_commit_sha": "8e5761dc8e1b417999ff30d748fc92c2ddff8040" }, { "hashed_email": "7f3b563762cedf85ff9ce23cb18b85fca5cd6be1", "any_commit_sha": "beffb2a400cf4e29ddee598109fa0e4f454553f1" }, { "hashed_email": "14db504d4cd3201da0bb52691e3113891ce88197", "any_commit_sha": "d0d37dcad22e5844cfc642a319b1af52bdd1f8db" }, { "hashed_email": "631d11d9fe908fc8f04b5865032c3043cb48fdfb", "any_commit_sha": "ab09fe8d5818af0ead81aef68b2d4fb324cc6ed5" }, { "hashed_email": "f49f2a5e660787beb1d0033eaaa9f0d533955c60", "any_commit_sha": "826259fc428396dbad7413125e473079cad4f483" }, { "hashed_email": "5613ca5bdc82051dbc3f75fe895cef0e40844bd3", "any_commit_sha": "af518f25ead85ccd25d6777b59d9556201784b06" }, { "hashed_email": "5bdcd3c0d4d24ae3e71b3b452a024c6324c7e4bb", "any_commit_sha": "450fdf58264e8fd4322cc791e278b70817bb4957" }, { "hashed_email": "50dca4ed57e4be4cd6ce4ae6274295c99e0f9e78", "any_commit_sha": "98c281cd4882f5dc1142e69bc6a248577fc4914e" }, { "hashed_email": "68c46a606457643eab92053c1c05574abb26f861", "any_commit_sha": "8868a59cbc3f3f3bd205be4bb2db1a5a6074d48b" }, { "hashed_email": "32d4b6e6dbf7cca2c4ef688c831ef2b8e1721fae", "any_commit_sha": "3e7bc3eeeb99f4119b0c53ff28dc1b0da53c2643" }, { "hashed_email": "ef8a458f72ea410a729d65a6795b289d6e5f16ce", "any_commit_sha": "d92225503a6f6fd7af0f47cd01ba2bb61f51a39a" }, { "hashed_email": "a216c04a42f93c3e1a9b0a3544fd3f541b41a7db", "any_commit_sha": "1a782c1873451b43d3952228f37c7e004070dfad" }, { "hashed_email": "333a0a56843ecfbd7d1f247ae3587f84236536bc", "any_commit_sha": "7b3ea9fc70389372f21a603bf3100f2b4d15ea3a" }, { "hashed_email": "1a73af9e7ae00182733b2292511b814be66f065f", "any_commit_sha": "89f19bab7023e9f7d9c224daa072c1a7d79ec0e5" }, { "hashed_email": "7555aa909aeefc4b48a22650b82530052cae90a6", "any_commit_sha": "8e7baa84b468580c91c882cfcb0b10842e20be6a" }, { "hashed_email": "61614e6008a3ae647761efae8e6f40d3640d5e86", "any_commit_sha": "465851418da7677cad9887fe1de77d28800ae2b1" }, { "hashed_email": "33bdcd680497cab5d61957b985513fceb724a953", "any_commit_sha": "fa1d12c28ea97729bf148185b9c30d6dda6a2bcb" }, { "hashed_email": "2a7e8f8b0d692d1e0b5424c4413307da38476423", "any_commit_sha": "aaced951fcd6165a1b465143def4a5a019725cae" }, { "hashed_email": "8f999d7dfae48e670d94b027d3cb84bc00ed943c", "any_commit_sha": "760bf9d67d4f0d39fa279fb23cd7e77007d5b6d6" }, { "hashed_email": "742cc7da48fa788d384ec77ccfb9a4657661404c", "any_commit_sha": "7973b166019dbc477599ebf62f8ef8d08d711720" }, { "hashed_email": "f33139e9ff8e43a3b958b7d51460544e7a9d4f55", "any_commit_sha": "5f10d22c0d8a764aac5e136c0da0ad0104ece0f6" }, { "hashed_email": "bba47ad64dee34c4d300854848a6414e05073f51", "any_commit_sha": "44cff32a6e8eed6290a0991f44bbfb2a50f0a173" }, { "hashed_email": "67664aa6ce912e0947777da9284428078a1d7954", "any_commit_sha": "050ec29f33bafb6bbbaeed80eb7217391b6e637b" }, { "hashed_email": "b65714dc99ca4275366631333f72ea351a4fc229", "any_commit_sha": "8d8847e3fabc2f1c335c15aa059e9c709bbac34a" }, { "hashed_email": "0bddf0d781aece727dabd7b493b87d152d652a87", "any_commit_sha": "e69d44ca74c567fcd3ec15aa0700a78175e74ea4" }, { "hashed_email": "5a44e6ed17c4e196d25b9ca3d47678de1c8a63ce", "any_commit_sha": "a426482d5fc7007cf5922dad0af1933360f78991" }, { "hashed_email": "b8faca8f45c84d5881cc3a71a4ee4299af07e530", "any_commit_sha": "6491d6b5ca369020a229b3eb7f772f1bc04e586d" }, { "hashed_email": "2a852a96f725fe2d9417bad4de79d50ac8f32d28", "any_commit_sha": "415fbe65f20deb434c5abed50e9e825e20952e68" }, { "hashed_email": "4518c7bd309b7828292441ffce16ced7cb33eedd", "any_commit_sha": "a3f4f13e8b1f91955fea0a7422b947020f48acfc" }, { "hashed_email": "ecd1f14f7c1c6dc7a40210bdcc3810e0107ecbc8", "any_commit_sha": "41001d6be714f5d875a3ac6b68a4a55eb2086744" }, { "hashed_email": "596727c8a0ea4db3ba2ceceedccbacd3d7b371b8", "any_commit_sha": "2b1c5a97b584d14da1d47e423432cc133e2b4e11" }, { "hashed_email": "a8e70ce470c554a6f43803df5187177f222204a8", "any_commit_sha": "e01d9103bb6c17a8c9f21954788fb6f550b69587" }, { "hashed_email": "b3a421eb3be2513778326c2c11b780145dbdf96b", "any_commit_sha": "33364432bbf87ed041a533d64b00a34077d6b62d" }, { "hashed_email": "368d0007e4626f70737d16df5e49ed8806b98c3f", "any_commit_sha": "32d12eb69e330fd4a4df3fb9df040665dd6450cb" }, { "hashed_email": "d6e1285e1c84d3d5885c2124fdacc780e9fc0a94", "any_commit_sha": "1a6fd31aec036ac6e786e56b9cafb4dba5ba40c7" }, { "hashed_email": "b3eef4c91db124096f17b389c40733c06b7d5036", "any_commit_sha": "29faac04d3a20cf96982e6f615b026d5101d773b" }, { "hashed_email": "88a1d58bf22a647dce58dd91f9595600dceabba9", "any_commit_sha": "4d148100591860f84bc2056028c06ab2fdd66eb7" }, { "hashed_email": "7864bb1e0e12322ea18ea731d051b95b75140567", "any_commit_sha": "7820c58ed3388c482d4cd7706868a9dad7319575" }, { "hashed_email": "d36de655fd7d73924ee153ac87b341a5b17183d0", "any_commit_sha": "d8a67868b740039964ee73ecdc7cca084e038f29" }, { "hashed_email": "ff359ca7f9aedbb05cd6aa3d17e7b3b3ad3b25c9", "any_commit_sha": "72789af10e19148f66b8c84e5a00f7aeece5da8c" }, { "hashed_email": "287e02744ae7c802bbb99a60be19e5052bdd29c3", "any_commit_sha": "e030afddacb30f42d9e6622e9b20d80461657ddc" }, { "hashed_email": "fbe788dcd509b324901fbdfe505a4d610d560569", "any_commit_sha": "f86b272a95b15b91816a0dcca43f45e458470fb5" }, { "hashed_email": "5b3c147a15c322255c2e37e47e0b5e0d1c8fc7bc", "any_commit_sha": "3ae44e6876828d16b5b6dd7523c5ff2578364ba2" }, { "hashed_email": "2c98d18550b6e94ee93faf6d92fa2bedb58842c9", "any_commit_sha": "610a1e39f8447895f30a47607593eb7d87486e39" }, { "hashed_email": "bb05168246ed1a6b66d0e7b1ffb0c5e3707764ca", "any_commit_sha": "d430bb7301697ff18cb4cfcce5b3a811703efc5e" }, { "hashed_email": "181323dd666a182bc2d953e52d0ac3ab54cd8391", "any_commit_sha": "62418673b98f48c318a35552f167ab19e8bdf259" }, { "hashed_email": "9deae027791a36ed810389301f71a062117d47d6", "any_commit_sha": "21a07ca6bc92ab18d6f06f4dc4b824f810533671" }, { "hashed_email": "4452d71687b6bc2c9389c3349fdc17fbd73b833b", "any_commit_sha": "1a7d47941d40d3ca3ec076fc845c1a70f87b82b6" }, { "hashed_email": "dd25cd0ca3ad8c14a6694cbb8a3808d02f48438c", "any_commit_sha": "47b71b22443d210f6b6ec0912fbd662670ed7ac7" }, { "hashed_email": "ec53c38edc8b8930f4ee038d3435d54cd7b59375", "any_commit_sha": "5a524f39c9d24aa6d57df1f74301f87bcd4b2786" }, { "hashed_email": "191236721bc8dcec4dcb6b41005498bd0792e640", "any_commit_sha": "dcf701bf3ce95d1a4dc3abd53d7e020f1245944a" }, { "hashed_email": "0968282e15ed9e224ab3a4b5d1973c8f7097dcea", "any_commit_sha": "cbf3396fdf1778b241bd8a48be164cdfca79c9e3" }, { "hashed_email": "d276d7a9ce588f1d810695ab45b46b32e405a054", "any_commit_sha": "e3296d4483b20425585bcd3aa3b76402eedf80c6" }, { "hashed_email": "8bb88644350361b87087e40823c867b8b5923f0f", "any_commit_sha": "d8ab564cc6e099ebe7f9a66df7fa176384393ec7" }, { "hashed_email": "c71e7261d37a4f6ae4cfb0cbd79081310a237e67", "any_commit_sha": "e234b033dda1c5a82efa9a5acda4274a3e75d83e" }, { "hashed_email": "91cf50d31a2a665c4bd7c7e6c018428ec29687a5", "any_commit_sha": "fff31453d75bc0b5da4b72f9ef8c4feb4556c328" }, { "hashed_email": "62eb0db178518a8376b23676c2639eb2732c0be8", "any_commit_sha": "141f661e9f17a4b568d3e6e3750e6ab1345a22ab" }, { "hashed_email": "165ff8434110f159a74f62730197c47aa03ad0c4", "any_commit_sha": "9021698a2db3b33d42a675ec1e428da02d6670b2" }, { "hashed_email": "2c0dc4fd93ee64b39355b29dd45c320cfb3c201e", "any_commit_sha": "c2b21a3c3018e4fcac0aae5e7169bbfe4604ee67" }, { "hashed_email": "cbdb0cc7f3f5b4be81a75fa7242590e3e9882e1e", "any_commit_sha": "fe52ac8cd252f9850ed3d0db7fd0e7af452f1f68" }, { "hashed_email": "b375a36861a21dce61868a5a9b415811d17b4e97", "any_commit_sha": "5e801d3ec3bd4c9a4f1448271d41c18f0eb514a3" }, { "hashed_email": "64b2b6d12bfe4baae7dad3d018f8cbf6b0e7a044", "any_commit_sha": "d0f33f5bfc2a576155e9e650f0a054b2e679afc4" }, { "hashed_email": "af042b13840a2b8ecdb0cfc2dcbfa9a25301163c", "any_commit_sha": "0a2efc0622c37cb959450bc20349d97ea5147d93" }, { "hashed_email": "139b5d1fe0e58763c95ffde6986245b6c7f5ec89", "any_commit_sha": "23c2162bdf9ca85b80e63b13c155f65641cbd395" }, { "hashed_email": "d95b56ce41a2e1ac4cecdd398defd7414407cc08", "any_commit_sha": "92487f081286c172d518195bc7861843d3f833cc" }, { "hashed_email": "fbd54dbbcf9e596abad4ccdc4dfc17f80ebeaee2", "any_commit_sha": "0e2aed7e93c4bae72579aeaf706fe14c8c70cd2e" }, { "hashed_email": "0ca96d224e8044b8ba18d5af3a49ac6cdcba8fbe", "any_commit_sha": "426f6b61bdc8557c6b9242b4d6082d2394afd426" }, { "hashed_email": "0600fd3c3898444a4e59315616cd806a2be266f0", "any_commit_sha": "0291861bcdd4916e0d85dcd06a1608150cd5be2d" }, { "hashed_email": "c5ef40b91c2665278acd9e1874a07c99c0b164fd", "any_commit_sha": "4d2969f6a585047ed18219354599bc26e000a94e" }, { "hashed_email": "2c71a55262ba6130c1ed1005a94c6b15a81b9019", "any_commit_sha": "3acef8631ea6b99ea580de5a8870e734ba168eac" }, { "hashed_email": "24bf68e341ce0fbd9259a5d51feed79682ea4eba", "any_commit_sha": "2b2e7d02ad374a13af990f72f2c79617f5753929" }, { "hashed_email": "4772d34e644b52ba3fd70eca28753d74824d83c4", "any_commit_sha": "84db1bfd8878f9ad5376a8877a72c4fa52c9c6fe" }, { "hashed_email": "c0a934bb7f5e6ff0b46c9cf35d69fc1d86ace91c", "any_commit_sha": "790484f78fd86e2261f529f86d5a45283b09b6a6" }, { "hashed_email": "045e46f151ba0f76023c851f68c13c434c412422", "any_commit_sha": "9da774735ab48c43ce0c908b457c29996137ab61" }, { "hashed_email": "0b2f7501dfd549ae8026aaa6ba9cc9b3b6307cd9", "any_commit_sha": "31aa759f34a4298d36c778f4a53cf3db4fe08675" }, { "hashed_email": "146b865580f1cbe78f97211de9bee7b3288eee2b", "any_commit_sha": "aa7d72cc68013323cdacd062154a38308aacfdde" }, { "hashed_email": "284427851f9f1fafd324039fdee42b63352fdd90", "any_commit_sha": "788fb82159ef1de9fd63414707204f5494dfba29" }, { "hashed_email": "1fc905d067cc16df41e6322380796a4d833a5022", "any_commit_sha": "fe9dc7a279a695e0564ecd2c891d3280e09af7c4" }, { "hashed_email": "9f8a2389a20ca0752aa9e95093515517e90e194c", "any_commit_sha": "8b0fd3a3dae0d0d94582b039f47429f1cb2c18c9" }, { "hashed_email": "04547db51792014fdd1b55c04bcece9dc3cab690", "any_commit_sha": "ed77a1f8ca013f02717f6581cc7e5a20e35dcb39" }, { "hashed_email": "51f856fad1bae2de74b1d02839ecf002f2a63fe5", "any_commit_sha": "a5cfd4091f06bf011771ce8ad9cebbf58382622f" }, { "hashed_email": "36f780fdbda5b2b2ce85c9ebb57086d1880ae757", "any_commit_sha": "f61cc737766f5358c7e7998cbbefd96c5ab3c29b" }, { "hashed_email": "ff7328b41963cb2a7050fbab536e4bac8c820b32", "any_commit_sha": "97d062682600e0dd4b3dd66804c22892b976cc1c" }, { "hashed_email": "21fcf19581dae4b7332a6adc7026744037b6fba5", "any_commit_sha": "398820ce40b97e23a84eba17ee3c81cb6f02f98d" }, { "hashed_email": "2e8142d82ecfe3f3e5bdef13577984d3f058cb54", "any_commit_sha": "d267d0040d8f4f70764edcdc9f1386eab2b1a645" }, { "hashed_email": "68ec43140b6f92234dc85f2523f8eefd9946767d", "any_commit_sha": "11a1d62f60814be098283e4e5e3d9dd61be82178" }, { "hashed_email": "89512d63e80a7cdf17b450bfbe453e8c3708ac8b", "any_commit_sha": "8f6631e891fe19160b6a0ba6b37a3007c2f23d28" }, { "hashed_email": "538f1f5ea53fbfb45b3721fc48dcd5a7827bd915", "any_commit_sha": "775ae2a4de20d49a9e99456551548ba4113057b5" }, { "hashed_email": "31b4bf6213854a26a9799707ef5a51cafbde3057", "any_commit_sha": "e4724b8baf9519b6eba2a1b01d240a135ac1bdde" }, { "hashed_email": "12dea96fec20593566ab75692c9949596833adc9", "any_commit_sha": "5aab94fa92b10b3705a1b14afef1814980e79dfd" }, { "hashed_email": "371fb2cd193b20c09c0d7179be8520df64ad21d3", "any_commit_sha": "64f4896e6b00b7484a5d962979d464483edace98" }, { "hashed_email": "d5aa170e875913b89d169c57b96b452548fabfff", "any_commit_sha": "4c8be67ebe2aa3f803bc729c79cbef623021e2ce" }, { "hashed_email": "c6e88b6afb8bf5890781d8633ca4b7b9a806a516", "any_commit_sha": "dd7d0a91c2ca16ddb7d1d9f952fdb31f6e2dd513" }, { "hashed_email": "3f2ecdef3c6c3b614e34115a95b25944cfa4198a", "any_commit_sha": "fa6df17f2f53cd54ac48e4efee1e2556afcc25bb" }, { "hashed_email": "6eb0c61201a96afc99cbf180f1c8d93c0a9fd8c8", "any_commit_sha": "56c05b41ee92de0445bbf3d017349ca9e0debbbf" }, { "hashed_email": "0a00ae03c9edd21d50a229f9fa1f98d9b3912b9e", "any_commit_sha": "dee4e9e6d4daf4c7bc6e7f453837184eaf8a36c3" }, { "hashed_email": "9176253dfc0bc82671a5e984646605f93319147a", "any_commit_sha": "0903753359221ea075ea7c33b2d916a47432c616" }, { "hashed_email": "5fb14e02dbe8d68df66f2d0999a4f829091cc16b", "any_commit_sha": "748366cb5edd85392f7161cea490d33f9a1af3c7" }, { "hashed_email": "030199bfc28d1fad7596105a92fdbaabcf8bfa5e", "any_commit_sha": "0aad40dfcd235b647576cbe832f6797f8409855a" }, { "hashed_email": "22715502305f5acc3bd5bf22a9c406e70a1e1348", "any_commit_sha": "23c59c21d3ded3dbf8543b022802659e0276143a" }, { "hashed_email": "4bf35f37a90e723b5f0a9024a7be0ec8a5176069", "any_commit_sha": "44e71fa47487884c908d3a185b989f3ebf3e8c05" }, { "hashed_email": "59bd0a3ff43b32849b319e645d4798d8a5d1e889", "any_commit_sha": "d5439a998f82b01279d9e3902bd28b79df47b17b" }, { "hashed_email": "ef6030070d6c28a2190c9f08f860c771114f20e3", "any_commit_sha": "c00063ac155a7601b0f5802b4ee18ca8bf6322f3" }];
        };

        DataService.prototype.mockRepositories = function mockRepositories() {
            return [{ "name": "j0nas/deichman2d", "n_commits": 70 }, { "name": "Homebrew/homebrew-core", "n_commits": 71 }, { "name": "rouault/gdal_coverage", "n_commits": 72 }, { "name": "llvm-project/llvm-project-submodule", "n_commits": 78 }, { "name": "llvm-project/llvm-project", "n_commits": 78 }, { "name": "ceejbot/jthoober", "n_commits": 79 }, { "name": "gonsakon/HolidayAPI", "n_commits": 79 }, { "name": "jasoncalabrese/indy-e4b", "n_commits": 81 }, { "name": "direwolf-github/my-app", "n_commits": 81 }, { "name": "WilliamBundy/rituals-game", "n_commits": 90 }, { "name": "derekcchan/derekcchan.github.io", "n_commits": 97 }, { "name": "miatribe/pipvpspy", "n_commits": 98 }, { "name": "dit-inc-us/Content", "n_commits": 100 }, { "name": "nathanbl/date-info", "n_commits": 100 }, { "name": "everypolitician-scrapers/romanian-parliament", "n_commits": 100 }, { "name": "marcomow/keklv", "n_commits": 101 }, { "name": "Team-Huawei/android_kernel_huawei_msm8909", "n_commits": 104 }, { "name": "shapiromatron/hawc", "n_commits": 107 }, { "name": "KammiO/kammio.github.io", "n_commits": 112 }, { "name": "screwdriver-cd-test/functional-git", "n_commits": 115 }, { "name": "ryanniehaus/open_source_package_builder", "n_commits": 120 }, { "name": "flameserver/downloads", "n_commits": 120 }, { "name": "yaks-all-the-way-down/hubpress.github.io", "n_commits": 122 }, { "name": "the-domains/rgv-guide", "n_commits": 133 }, { "name": "Door43/d43-en", "n_commits": 135 }, { "name": "yann-morin-1998/buildroot", "n_commits": 151 }, { "name": "jasoncalabrese/indy-e1-cgm7", "n_commits": 155 }, { "name": "newstools/newstools_article_index", "n_commits": 157 }, { "name": "the-domains/besiana", "n_commits": 158 }, { "name": "MarkEWaite/jenkins-bugs", "n_commits": 161 }, { "name": "BrewTestBot/homebrew-core", "n_commits": 168 }, { "name": "xheomar/xheomar.github.io", "n_commits": 207 }, { "name": "ingenue/hunter-cache", "n_commits": 223 }, { "name": "OpenLocalizationTestOrg/ol-test1", "n_commits": 251 }, { "name": "ros-drivers-gbp/pointgrey_camera_driver-release", "n_commits": 282 }, { "name": "toxtli/dailypush", "n_commits": 299 }, { "name": "mikestebbins/openapsdev", "n_commits": 346 }, { "name": "jasoncalabrese/indy-e1h", "n_commits": 425 }, { "name": "CodePipeline-Test/feature-tests", "n_commits": 438 }, { "name": "TonyMiloro/Pr-cticas-Preprofesionales", "n_commits": 494 }, { "name": "everypolitician-scrapers/mexico-diputados-2015", "n_commits": 495 }, { "name": "KenanSulayman/heartbeat", "n_commits": 550 }, { "name": "OpenLocalizationTestOrg/ol-test1-zhcn", "n_commits": 587 }, { "name": "OpenLocalizationTestOrg/ol-test1-dede", "n_commits": 588 }, { "name": "teku45/Web-DROP", "n_commits": 598 }, { "name": "ros-gbp/common_msgs-release", "n_commits": 614 }, { "name": "OpenLocalizationTestOrg/ol-test1-handback", "n_commits": 765 }, { "name": "OpenLocalizationTestOrg/ol-test1-handoff", "n_commits": 770 }, { "name": "firehol/blocklist-ipsets", "n_commits": 1176 }, { "name": "api-evangelist/monitoring", "n_commits": 2102 }];
        };

        return DataService;
    }()) || _class);
});
define('environment',["exports"], function (exports) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = {
    debug: true,
    testing: true
  };
});
define('main',['exports', './environment'], function (exports, _environment) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.configure = configure;

  var _environment2 = _interopRequireDefault(_environment);

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
      default: obj
    };
  }

  Promise.config({
    warnings: {
      wForgottenReturn: false
    }
  });

  function configure(aurelia) {
    aurelia.use.standardConfiguration().feature('resources');

    if (_environment2.default.debug) {
      aurelia.use.developmentLogging();
    }

    if (_environment2.default.testing) {
      aurelia.use.plugin('aurelia-testing');
    }

    aurelia.start().then(function () {
      return aurelia.setRoot();
    });
  }
});
define('resources/index',["exports"], function (exports) {
  "use strict";

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.configure = configure;
  function configure(config) {}
});
define('text!app.html', ['module'], function(module) { module.exports = "<template>\n  <require from=\"../styles/main.css\"></require>\n  <svg id=\"graph\"></svg>\n  <div class=\"spinner\">\n    <i class=\"fa fa-spinner fa-spin fa-4x\"></i>\n  </div>\n</template>\n"; });
//# sourceMappingURL=app-bundle.js.map