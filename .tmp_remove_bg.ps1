Add-Type -AssemblyName System.Drawing

function Remove-Background([string]$inputPath, [string]$outputPath) {
  $bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $inputPath))
  $w = $bmp.Width
  $h = $bmp.Height
  $visited = New-Object 'bool[]' ($w * $h)
  $queue = New-Object 'System.Collections.Generic.Queue[System.Drawing.Point]'

  function IsBgColor([System.Drawing.Color]$c) {
    $max = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
    $min = [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
    $grayish = (($max - $min) -le 28)
    $bright = ((($c.R + $c.G + $c.B) / 3.0) -ge 95)
    return $grayish -and $bright
  }

  function TryEnqueue([int]$x, [int]$y) {
    if ($x -lt 0 -or $y -lt 0 -or $x -ge $w -or $y -ge $h) { return }
    $i = $y * $w + $x
    if ($visited[$i]) { return }
    $c = $bmp.GetPixel($x, $y)
    if (-not (IsBgColor $c)) { return }
    $visited[$i] = $true
    $queue.Enqueue([System.Drawing.Point]::new($x, $y))
  }

  for ($x = 0; $x -lt $w; $x++) {
    TryEnqueue $x 0
    TryEnqueue $x ($h - 1)
  }
  for ($y = 0; $y -lt $h; $y++) {
    TryEnqueue 0 $y
    TryEnqueue ($w - 1) $y
  }

  while ($queue.Count -gt 0) {
    $p = $queue.Dequeue()
    $x = $p.X
    $y = $p.Y
    $orig = $bmp.GetPixel($x, $y)
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $orig.R, $orig.G, $orig.B))

    TryEnqueue ($x + 1) $y
    TryEnqueue ($x - 1) $y
    TryEnqueue $x ($y + 1)
    TryEnqueue $x ($y - 1)
  }

  $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$targets = @(
  @{in='public/images/player.png'; out='public/images/player-transparent.png'},
  @{in='public/images/npc1.png'; out='public/images/npc1-transparent.png'},
  @{in='public/images/npc2.png'; out='public/images/npc2-transparent.png'},
  @{in='public/images/npc3.png'; out='public/images/npc3-transparent.png'},
  @{in='public/images/npc4.png'; out='public/images/npc4-transparent.png'}
)

foreach ($t in $targets) {
  Remove-Background $t.in $t.out
  Write-Output ("generated: {0}" -f $t.out)
}
