let userData = [];

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');


    // Auto focus vào input khi chuyển sang tab nhập mã
    if (tabName === 'input') {
        setTimeout(() => {
            document.getElementById('codeInput').focus();
        }, 100);
    }
}

// Excel file handling
document.getElementById('excelFile').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('excelFile', file);

    fetch('/upload-excel', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                userData = data.data;
                displayData();
                updateStats();
                alert('Import thành công!');
            } else {
                alert('Import thất bại: ' + (data.error || data.message));
            }
        })
        .catch(err => {
            alert('Lỗi khi upload file: ' + err.message);
        });
});

function displayData() {
    const tableBody = document.getElementById('tableBody');
    const table = document.getElementById('dataTable');
    const statsContainer = document.getElementById('statsContainer');
    const exportBtn = document.getElementById('exportBtn');

    tableBody.innerHTML = '';

    userData.forEach((person, index) => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td class="textcenter"><strong>${person.ma}</strong></td>
            <td>${person.hoTen}</td>
            <td class="textcenter">${person.gioiTinh}</td>
            <td>${person.diaChi}</td>
            <td>${person.khoa}</td>
            <td>${person.donVi}</td>
            <td><span class="status-${person.checkin === 'Đã vào' ? 'da-vao' : 'chua-vao'}">${person.checkin}${person.timestamp ? ' ' + person.timestamp : ''}</span></td>
            <td><button onclick="editPerson(${index})">✏️</button></td>`;

        tableBody.appendChild(row);
    });

    table.style.display = 'table';
    statsContainer.style.display = 'grid';
    exportBtn.style.display = 'inline-block';
}

function updateStats() {
    const total = userData.length;
    const checkedIn = userData.filter(person => person.checkin === 'Đã vào').length;
    const notCheckedIn = total - checkedIn;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('checkedInCount').textContent = checkedIn;
    document.getElementById('notCheckedInCount').textContent = notCheckedIn;
}

// Code Input Processing
document.getElementById('codeInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        processCode();
    }
});

function processCode() {
    const input = document.getElementById('codeInput');
    const code = input.value.trim();

    if (!code) {
        alert('Vui lòng nhập mã!');
        return;
    }

    handleCode(code);
    input.value = '';
    input.focus();
}

function clearInput() {
    const input = document.getElementById('codeInput');
    input.value = '';
    input.focus();
    document.getElementById('inputResult').innerHTML = '';
}

function handleCode(code) {
    fetch('/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                // Lấy lại dữ liệu mới nhất từ server
                fetch('/data')
                    .then(res => res.json())
                    .then(data => {
                        if (data.data && Array.isArray(data.data)) {
                            userData = data.data;
                            displayData();
                            updateStats();
                        }
                        showCheckinResult(result.person, true);
                    });
            } else if (result.person) {
                showCheckinResult(result.person, false);
            } else {
                document.getElementById('inputResult').innerHTML = `
                <div class="result-card" style="background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%);">
                    <h3>❌ Không tìm thấy</h3>
                    <p>Mã không tồn tại trong danh sách</p>
                    <p><strong>Mã nhập:</strong> "${code}" (${typeof code})</p>
                    <p><strong>Có ${userData.length} mã trong danh sách</strong></p>
                    <p><strong>5 mã đầu tiên:</strong> ${userData.slice(0, 5).map(p => `"${p.ma}"`).join(', ')}</p>
                </div>
            `;
            }
        })
        .catch(err => {
            alert('Lỗi khi checkin: ' + err.message);
        });
}

function showCheckinResult(person, success) {
    const resultDiv = document.getElementById('inputResult');
    const statusColor = success ? '#28a745' : '#fd7e14';
    const statusIcon = success ? '✅' : '⚠️';
    const statusText = success ? 'Checkin thành công!' : 'Đã checkin trước đó';

    resultDiv.innerHTML = `
                <div class="result-card" style="background: linear-gradient(135deg, ${statusColor} 0%, ${statusColor}aa 100%);">
                    <h3>${statusIcon} ${statusText}</h3>
                    <div class="result-info">
                        <div class="info-item">
                            <div class="info-label">Mã:</div>
                            <div>${person.ma}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Họ tên:</div>
                            <div>${person.hoTen}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Giới tính:</div>
                            <div>${person.gioiTinh}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Khoa/Phòng:</div>
                            <div>${person.khoa}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Đơn vị:</div>
                            <div>${person.donVi}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Trạng thái:</div>
                            <div><strong>${person.checkin}</strong></div>
                        </div>
                    </div>
                </div>
            `;
}

// Export to Excel
function exportToExcel() {
    const exportData = userData.map(person => ({
        'MÃ': person.ma,
        'HỌ VÀ TÊN': person.hoTen,
        'GIỚI TÍNH': person.gioiTinh,
        'ĐỊA CHỈ': person.diaChi,
        'KHOA/PHÒNG': person.khoa,
        'ĐƠN VỊ': person.donVi,
        'CHECKIN': person.checkin
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checkin Data");

    const now = new Date();
    const timestamp = now.getFullYear() + '-' +
        (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') + '-' +
        now.getMinutes().toString().padStart(2, '0');

    XLSX.writeFile(wb, `checkin_data_${timestamp}.xlsx`);
}

window.addEventListener('DOMContentLoaded', function () {
    fetch('/data')
        .then(res => res.json())
        .then(data => {
            if (data.data && Array.isArray(data.data)) {
                userData = data.data;
                displayData();
                updateStats();
            }
        })
        .catch(err => {
            console.error('Không thể tải dữ liệu từ server:', err);
        });
});

function editPerson(index) {
    const person = userData[index];
    const formHtml = `
        <div id="editModal" class="modal">
            <div class="modal-content">
                <h3>Chỉnh sửa thông tin</h3>
                <label>MÃ: <input id="editMa" value="${person.ma}" disabled></label><br>
                <label>HỌ VÀ TÊN: <input id="editHoTen" value="${person.hoTen}"></label><br>
                <label>GIỚI TÍNH: <input id="editGioiTinh" value="${person.gioiTinh}"></label><br>
                <label>ĐỊA CHỈ: <input id="editDiaChi" value="${person.diaChi}"></label><br>
                <label>KHOA/PHÒNG: <input id="editKhoa" value="${person.khoa}"></label><br>
                <label>ĐƠN VỊ: <input id="editDonVi" value="${person.donVi}"></label><br>
                <button onclick="saveEdit(${index})">Lưu</button>
                <button onclick="closeEdit()">Hủy</button>
            </div>
        </div>
        <style>
        .modal { position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:1000;}
        .modal-content { background:#fff;padding:20px;border-radius:8px;min-width:300px;}
        </style>
    `;
    document.body.insertAdjacentHTML('beforeend', formHtml);
}

function closeEdit() {
    const modal = document.getElementById('editModal');
    if (modal) modal.remove();
}

function saveEdit(index) {
    const person = userData[index];
    const updated = {
        ma: person.ma,
        hoTen: document.getElementById('editHoTen').value,
        gioiTinh: document.getElementById('editGioiTinh').value,
        diaChi: document.getElementById('editDiaChi').value,
        khoa: document.getElementById('editKhoa').value,
        donVi: document.getElementById('editDonVi').value
    };
    fetch('/edit-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma: person.ma, updated })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            userData = data.data;
            displayData();
            updateStats();
            closeEdit();
        } else {
            alert('Lỗi khi lưu: ' + (data.message || 'Không xác định'));
        }
    });
}
