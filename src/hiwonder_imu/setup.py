from setuptools import find_packages, setup

package_name = 'hiwonder_imu'

setup(
    name=package_name,
    version='0.0.1',
    packages=find_packages(exclude=['test']),
    data_files=[
        (
            'share/ament_index/resource_index/packages',
            ['resource/' + package_name]
        ),
        (
            'share/' + package_name,
            ['package.xml']
        ),
    ],
    install_requires=['setuptools', 'pyserial'],
    zip_safe=True,
    maintainer='ubuntu',
    maintainer_email='seenivasanthangarasu@gmail.com',
    description='ROS 2 driver for the Hiwonder IMU inertial navigation module.',
    license='MIT',
    entry_points={
        'console_scripts': [
            'hiwonder_imu_node = hiwonder_imu.hiwonder_imu_node:main',
        ],
    },
)
