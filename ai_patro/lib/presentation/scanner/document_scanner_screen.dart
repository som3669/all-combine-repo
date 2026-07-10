import 'dart:io';
import 'dart:typed_data';

import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';

import '../../core/providers/language_provider.dart';
import '../../core/theme/app_theme.dart';

enum _ScanFilter { original, grayscale, blackWhite, enhance }

extension on _ScanFilter {
  String label(bool isEn) => switch (this) {
        _ScanFilter.original => isEn ? 'Original' : 'सामान्य',
        _ScanFilter.grayscale => isEn ? 'Gray' : 'ग्रे',
        _ScanFilter.blackWhite => isEn ? 'B & W' : 'कालो-सेतो',
        _ScanFilter.enhance => isEn ? 'Enhance' : 'सुधार',
      };
}

/// Camera-based document scanner: capture pages, apply a CamScanner-style
/// filter per page, then export the set as a single named PDF.
class DocumentScannerScreen extends ConsumerStatefulWidget {
  const DocumentScannerScreen({super.key});

  @override
  ConsumerState<DocumentScannerScreen> createState() =>
      _DocumentScannerScreenState();
}

class _DocumentScannerScreenState
    extends ConsumerState<DocumentScannerScreen> {
  final List<String> _pages = [];
  final List<_ScanFilter> _filters = [];
  final Map<String, Uint8List> _cache = {};
  bool _busy = false;

  Future<void> _scan() async {
    try {
      final paths = await CunningDocumentScanner.getPictures(
        noOfPages: 30,
        scannerSource: ScannerSource.cameraAndGallery,
      );
      if (paths != null && paths.isNotEmpty) {
        setState(() {
          _pages.addAll(paths);
          _filters.addAll(List.filled(paths.length, _ScanFilter.original));
        });
      }
    } catch (e) {
      _showError(e.toString());
    }
  }

  void _removePage(int index) => setState(() {
        _pages.removeAt(index);
        _filters.removeAt(index);
      });

  void _clearAll() => setState(() {
        _pages.clear();
        _filters.clear();
      });

  Future<Uint8List> _bytesFor(int index) async {
    final path = _pages[index];
    final filter = _filters[index];
    final key = '$path#${filter.name}';
    final cached = _cache[key];
    if (cached != null) return cached;

    final raw = await File(path).readAsBytes();
    if (filter == _ScanFilter.original) {
      _cache[key] = raw;
      return raw;
    }

    final decoded = img.decodeImage(raw)!;
    final out = switch (filter) {
      _ScanFilter.grayscale => img.grayscale(decoded),
      _ScanFilter.blackWhite =>
        img.adjustColor(img.grayscale(decoded), contrast: 1.9, brightness: 1.15),
      _ScanFilter.enhance =>
        img.adjustColor(decoded, contrast: 1.15, saturation: 1.15, brightness: 1.05),
      _ScanFilter.original => decoded,
    };
    final bytes = Uint8List.fromList(img.encodeJpg(out, quality: 92));
    _cache[key] = bytes;
    return bytes;
  }

  Future<void> _openFilterSheet(int index) async {
    final isEn = ref.read(languageProvider) == AppLanguage.english;
    var selected = _filters[index];

    final result = await showModalBottomSheet<_ScanFilter>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: AspectRatio(
                    aspectRatio: 0.75,
                    child: FutureBuilder<Uint8List>(
                      future: () async {
                        final saved = _filters[index];
                        _filters[index] = selected;
                        final bytes = await _bytesFor(index);
                        _filters[index] = saved;
                        return bytes;
                      }(),
                      builder: (_, snap) => snap.hasData
                          ? Image.memory(snap.data!, fit: BoxFit.cover)
                          : const Center(child: CircularProgressIndicator()),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  children: _ScanFilter.values
                      .map((f) => ChoiceChip(
                            label: Text(f.label(isEn)),
                            selected: selected == f,
                            onSelected: (_) =>
                                setSheetState(() => selected = f),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.pop(sheetContext, selected),
                  child: Text(isEn ? 'Apply' : 'लागू गर्नुहोस्'),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (result != null) setState(() => _filters[index] = result);
  }

  Future<String?> _promptFileName(bool isEn) {
    final controller = TextEditingController(
      text: 'Scan_${DateTime.now().millisecondsSinceEpoch}',
    );
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(isEn ? 'Name your PDF' : 'PDF नाम राख्नुहोस्'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(suffixText: '.pdf'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(isEn ? 'Cancel' : 'रद्द गर्नुहोस्'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: Text(isEn ? 'Continue' : 'अगाडि बढ्नुहोस्'),
          ),
        ],
      ),
    );
  }

  Future<File> _buildPdf(String fileName) async {
    final doc = pw.Document();
    for (var i = 0; i < _pages.length; i++) {
      final bytes = await _bytesFor(i);
      final image = pw.MemoryImage(bytes);
      doc.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(0),
          build: (_) => pw.Center(
            child: pw.Image(image, fit: pw.BoxFit.contain),
          ),
        ),
      );
    }

    final dir = await getApplicationDocumentsDirectory();
    final scansDir = Directory('${dir.path}/scans');
    if (!scansDir.existsSync()) scansDir.createSync(recursive: true);
    final safeName = fileName.trim().isEmpty
        ? 'Scan_${DateTime.now().millisecondsSinceEpoch}'
        : fileName.trim().replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    final file = File('${scansDir.path}/$safeName.pdf');
    return file.writeAsBytes(await doc.save());
  }

  Future<void> _finish({required bool share}) async {
    if (_pages.isEmpty || _busy) return;
    final isEn = ref.read(languageProvider) == AppLanguage.english;
    final fileName = await _promptFileName(isEn);
    if (fileName == null) return;

    setState(() => _busy = true);
    try {
      final file = await _buildPdf(fileName);
      final pageCount = _pages.length;
      if (!mounted) return;
      _clearAll();
      setState(() => _busy = false);
      if (share) {
        await Share.shareXFiles([XFile(file.path)],
            text: file.path.split(Platform.pathSeparator).last);
      } else {
        await OpenFilex.open(file.path);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Saved PDF · $pageCount pages')),
      );
    } catch (e) {
      setState(() => _busy = false);
      _showError(e.toString());
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final isEn = ref.watch(languageProvider) == AppLanguage.english;

    return Scaffold(
      appBar: AppBar(
        title: Text(isEn ? 'Document Scanner' : 'कागजात स्क्यानर'),
        actions: [
          if (_pages.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined),
              tooltip: isEn ? 'Clear all' : 'सबै हटाउनुहोस्',
              onPressed: _clearAll,
            ),
        ],
      ),
      body: _pages.isEmpty ? _buildEmpty(isEn) : _buildPages(isEn),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _scan,
        icon: const Icon(Icons.document_scanner_outlined),
        label: Text(isEn ? 'Scan' : 'स्क्यान गर्नुहोस्'),
      ),
      bottomNavigationBar: _pages.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : () => _finish(share: true),
                        icon: const Icon(Icons.share_outlined),
                        label: Text(isEn ? 'Share PDF' : 'PDF साझा गर्नुहोस्'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _busy ? null : () => _finish(share: false),
                        icon: _busy
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.picture_as_pdf_outlined),
                        label: Text(isEn ? 'Save PDF' : 'PDF बचत गर्नुहोस्'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildEmpty(bool isEn) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.document_scanner_outlined,
                size: 72, color: AppTheme.primary.withValues(alpha: 0.4)),
            const SizedBox(height: 16),
            Text(
              isEn
                  ? 'Scan documents, receipts or notes\nand save them as a PDF'
                  : 'कागजात, रसिद वा नोटहरू स्क्यान गरी\nPDF को रूपमा बचत गर्नुहोस्',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPages(bool isEn) {
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.7,
      ),
      itemCount: _pages.length,
      itemBuilder: (_, i) => GestureDetector(
        onTap: () => _openFilterSheet(i),
        child: Stack(
          children: [
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: FutureBuilder<Uint8List>(
                  future: _bytesFor(i),
                  builder: (_, snap) => snap.hasData
                      ? Image.memory(snap.data!, fit: BoxFit.cover)
                      : Container(
                          color: Colors.grey[300],
                          child: const Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        ),
                ),
              ),
            ),
            Positioned(
              top: 4,
              left: 4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('${i + 1}',
                    style: const TextStyle(color: Colors.white, fontSize: 11)),
              ),
            ),
            if (_filters[i] != _ScanFilter.original)
              Positioned(
                bottom: 4,
                left: 4,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.85),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(_filters[i].label(isEn),
                      style:
                          const TextStyle(color: Colors.white, fontSize: 10)),
                ),
              ),
            Positioned(
              top: 2,
              right: 2,
              child: InkWell(
                onTap: () => _removePage(i),
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(
                    color: Colors.black54,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, color: Colors.white, size: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
