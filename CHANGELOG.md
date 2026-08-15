# Changelog

## [0.13.0](https://github.com/lezli01/markpad/compare/v0.12.0...v0.13.0) (2026-08-15)


### Features

* add selectable global search scope ([c9e233f](https://github.com/lezli01/markpad/commit/c9e233f1e90f4de98b94d78505ed79c34b35c6a5))
* add selectable global search scope ([d2fc102](https://github.com/lezli01/markpad/commit/d2fc1029f41a353fd5bc545032629a0bb1b5c2da))

## [0.12.0](https://github.com/lezli01/markpad/compare/v0.11.0...v0.12.0) (2026-08-15)


### Features

* add in-document search ([7e6fbf0](https://github.com/lezli01/markpad/commit/7e6fbf077d48fe2131e76170aba9bd96c8543128))
* add in-document search ([8d3189f](https://github.com/lezli01/markpad/commit/8d3189f1ab349dcbf2801b1eaa7d79c7c4b6de45))
* add workspace file search ([f1a8c2e](https://github.com/lezli01/markpad/commit/f1a8c2e7d9c62e8998aeffae529bcfa46559a973))
* search text across files ([6f2438f](https://github.com/lezli01/markpad/commit/6f2438f53322352f88ce343e88a62f3163374929))

## [0.11.0](https://github.com/lezli01/markpad/compare/v0.10.0...v0.11.0) (2026-08-11)


### Features

* add YAML as a third document language ([83f7805](https://github.com/lezli01/markpad/commit/83f7805208c506f3dde639439bd0f1ee3deb12e0))
* add YAML as a third document language ([f29a987](https://github.com/lezli01/markpad/commit/f29a987bf23fa5023cc2db54854dfcb4312ccfee)), closes [#106](https://github.com/lezli01/markpad/issues/106)
* detect when an open file changes on disk ([8193556](https://github.com/lezli01/markpad/commit/819355687d8d2de03fb8677cdd9d2fc28305ed68)), closes [#108](https://github.com/lezli01/markpad/issues/108)
* notify when an open file changes on disk, with a reload option ([fc15675](https://github.com/lezli01/markpad/commit/fc15675e817f3230790cd562baf9131cd072abce))
* offer a reload when a file has changed on disk ([f489298](https://github.com/lezli01/markpad/commit/f4892982882612e933af5d5ba1a8b650a752ddbf)), closes [#108](https://github.com/lezli01/markpad/issues/108)
* render diagrams from fenced code blocks ([3d1ab45](https://github.com/lezli01/markpad/commit/3d1ab45af36935a549ce569dc3ed9ae92db043ae))
* render diagrams from fenced code blocks ([5e8fcb7](https://github.com/lezli01/markpad/commit/5e8fcb7aab1a40c14a3d7fc96ea4e794794abd11)), closes [#103](https://github.com/lezli01/markpad/issues/103)


### Bug Fixes

* say YAML too in the disabled view-mode tooltip ([d33107b](https://github.com/lezli01/markpad/commit/d33107be6e784f9972d38f50c65faad0ff73607a))

## [0.10.0](https://github.com/lezli01/markpad/compare/v0.9.0...v0.10.0) (2026-08-05)


### Features

* **editor:** show line numbers for Markdown too ([507ccf1](https://github.com/lezli01/markpad/commit/507ccf1d1800cc2e37d81c0a2a32a9ea93b129fe))
* **json:** quote a bare value that stops being a number ([0577a2f](https://github.com/lezli01/markpad/commit/0577a2f4c0525a565733290aa62dbafedbd3af41))
* **preview:** sync editor and preview scrolling in split view ([49b90a1](https://github.com/lezli01/markpad/commit/49b90a1f77e4e5b084e0838983e7dbb07c478486))
* **recents:** bulk close actions in the context menu ([b3679f5](https://github.com/lezli01/markpad/commit/b3679f51f2a64fe25310c05e174ed0a6fa9497b2))
* split-view scroll sync, recents bulk close, JSON quoting, Markdown line numbers ([2977d71](https://github.com/lezli01/markpad/commit/2977d71ffa887a1a1b71ac83db2be8b9ee6de6a5))


### Bug Fixes

* keep linkifying scheme-less hosts under markdown-it 15 ([4b743ae](https://github.com/lezli01/markpad/commit/4b743ae0fcdbc31480b8fc42356d0bf25acd029b))

## [0.9.0](https://github.com/lezli01/markpad/compare/v0.8.0...v0.9.0) (2026-08-03)


### Features

* add typing comforts for JSON editing ([45e9c12](https://github.com/lezli01/markpad/commit/45e9c1258985d87df18a62850dc72e25ceaf49d7)), closes [#72](https://github.com/lezli01/markpad/issues/72)
* enable the JSON typing comforts in the editor ([baf16f6](https://github.com/lezli01/markpad/commit/baf16f6434938e465cf894633f917737c81dcea3)), closes [#72](https://github.com/lezli01/markpad/issues/72)
* typing comforts for JSON editing ([44c0f63](https://github.com/lezli01/markpad/commit/44c0f638c0a0fdcc76c36a88fde659f054c68ac1))


### Bug Fixes

* theme the language toggle's drop-down list ([9dfed59](https://github.com/lezli01/markpad/commit/9dfed593f76921bc79bbd5d4d9601506f805f304))
* theme the language toggle's drop-down list ([b713a02](https://github.com/lezli01/markpad/commit/b713a02a9e4bb069097ed7892ae9d71ad847eb10)), closes [#74](https://github.com/lezli01/markpad/issues/74)

## [0.8.0](https://github.com/lezli01/markpad/compare/v0.7.1...v0.8.0) (2026-07-21)


### Features

* add JSON dialog filters, language persistence, .json association ([71ea394](https://github.com/lezli01/markpad/commit/71ea394845e2ea7642a30b3b8ad657757ffb08a1))
* add JSON document language detection and text actions ([3d710ec](https://github.com/lezli01/markpad/commit/3d710ec2240bb12d1f6ed15a3ad954950ccf6156))
* add JSON toolbar, language toggle, and editor-only JSON view ([28816e5](https://github.com/lezli01/markpad/commit/28816e58d0b8ae2e18058358151d80eb9cb6f108))
* JSON file support with highlighting, formatting, validation, and folding ([298b20c](https://github.com/lezli01/markpad/commit/298b20c6873df4d5dfd24ccc4c7e813ae33158ca))
* per-language editor with JSON highlighting, folding, and lint ([97994af](https://github.com/lezli01/markpad/commit/97994af3516ee691dacfb65801a57b5bfeae4ead))


### Bug Fixes

* address adversarial review findings for JSON support ([883f7f0](https://github.com/lezli01/markpad/commit/883f7f06f7c8abf7be3f9fa5d0753a8b7ba16616))

## [0.7.1](https://github.com/lezli01/markpad/compare/v0.7.0...v0.7.1) (2026-07-07)


### Bug Fixes

* enable raw HTML for anchor navigation ([88dc621](https://github.com/lezli01/markpad/commit/88dc6213e025a897bc260cb1a2509f7cb159de57))
* enable raw HTML to support anchor navigation in TOC ([3af56ac](https://github.com/lezli01/markpad/commit/3af56ace00ee187ba9cb885c72511755fc3a633a))

## [0.7.0](https://github.com/lezli01/markpad/compare/v0.6.0...v0.7.0) (2026-07-04)


### Features

* show absolute path under recent files with 2-line clamp ([4b75ffe](https://github.com/lezli01/markpad/commit/4b75ffe8ec9f54b89bba425d6206235b3b54b817))
* show absolute path under recent files with 2-line clamp ([e4dd6b4](https://github.com/lezli01/markpad/commit/e4dd6b4e40b8059b3397d73b86ac959dde3a2e69))

## [0.6.0](https://github.com/lezli01/markpad/compare/v0.5.0...v0.6.0) (2026-07-03)


### Features

* redesign around a recent-files sidebar with a flat, professional look ([16d4559](https://github.com/lezli01/markpad/commit/16d45593567d6965d8245ce0a189855d6bfc055c))
* redesign around a recent-files sidebar with a flat, professional look ([009c239](https://github.com/lezli01/markpad/commit/009c2397e71f102ae4e20092cead57edc70465f7))
* reflect cursor formatting in toolbar and scroll preview anchors ([0bcd263](https://github.com/lezli01/markpad/commit/0bcd26304a2412180293368a15a04f64bfec7220))
* reflect cursor formatting in toolbar and scroll preview anchors ([63bda42](https://github.com/lezli01/markpad/commit/63bda420933ce36bcf28b1e33456dac452099788))


### Bug Fixes

* polish redesign UI and flatten the app logo ([01112fd](https://github.com/lezli01/markpad/commit/01112fdf483908513cca9aa96515e89c7157afe0))
* remove background gap between recents sidebar and top bar ([4a9aa6a](https://github.com/lezli01/markpad/commit/4a9aa6adc2b550bd88457330c000969e4b193cae))

## [0.5.0](https://github.com/lezli01/markpad/compare/v0.4.0...v0.5.0) (2026-05-29)


### Features

* **editor:** add markdown formatting command engine ([e3795f1](https://github.com/lezli01/markpad/commit/e3795f16c68924de4a00d4ac718fcb7c3f083dbb))
* **editor:** expose format API and keyboard shortcuts ([000e02b](https://github.com/lezli01/markpad/commit/000e02bc0b34722471389d871cfa2ddab3badb33))
* markdown editing toolbar ([b06f05e](https://github.com/lezli01/markpad/commit/b06f05e1b274dfec627acf95499771c6d512a9cb))
* **ui:** add markdown formatting toolbar component ([228f6ee](https://github.com/lezli01/markpad/commit/228f6eece785a177119d83daa34c88828808de13))
* **ui:** mount the formatting toolbar in the workspace ([0ea97a0](https://github.com/lezli01/markpad/commit/0ea97a0d7852e8af5db7c2c6d3388fe3ef76e101))

## [0.4.0](https://github.com/lezli01/markpad/compare/v0.3.0...v0.4.0) (2026-05-22)


### Features

* file association single instance ([a7a2514](https://github.com/lezli01/markpad/commit/a7a2514d9789fa18fb600f34124c5c4b24bff979))
* implemented ([d7068bd](https://github.com/lezli01/markpad/commit/d7068bd8c0e8a236dc6c184896ec4972dff3af02))


### Bug Fixes

* file saving issue ([b92e8d4](https://github.com/lezli01/markpad/commit/b92e8d4b402a43ec392225d297450df094fb5c37))
* fixing file path ([8ca042b](https://github.com/lezli01/markpad/commit/8ca042b89de1721244f399ab6745ba9f8aa27c74))

## [0.3.0](https://github.com/lezli01/markpad/compare/v0.2.0...v0.3.0) (2026-05-21)


### Features

* added implementation ([dc7c496](https://github.com/lezli01/markpad/commit/dc7c496b0b391bf7fab6ed9bc00286d903f391b0))
* added keyboard shortcuts ([9a8f01a](https://github.com/lezli01/markpad/commit/9a8f01a9bbedeaf93f13f2e4b7dceed7ed58ba72))
* added new button ([658143a](https://github.com/lezli01/markpad/commit/658143a5de91ab039aa5bbbd0d9a6af415892329))
* basic functionalities ([946a166](https://github.com/lezli01/markpad/commit/946a16669976d2e64b1a7eb6400a1cb2f86d103a))
* implemented ([b82a70e](https://github.com/lezli01/markpad/commit/b82a70edd29b8e69ebba3fc0a6e35a7d9d979987))
* implemented new functionalities ([24999c4](https://github.com/lezli01/markpad/commit/24999c43689cc7c3f20d7fd270927b4c230cafb7))
* multi file tabs ([ca37e74](https://github.com/lezli01/markpad/commit/ca37e74c03fe361bcf7739131228043ea6bf54c2))
* save file controls ([a5eef42](https://github.com/lezli01/markpad/commit/a5eef422eeb40d78869a562ffc1ee4acf71a9723))

## [0.2.0](https://github.com/lezli01/markpad/compare/v0.1.0...v0.2.0) (2026-05-20)


### Features

* foundation, split pane ([d1b3660](https://github.com/lezli01/markpad/commit/d1b36603ceef26ffa0d0d503eacb27fc034bca03))
* implementation added ([93b7517](https://github.com/lezli01/markpad/commit/93b75177ee0d49846ea76b26f5d83cd20b4fd1a2))
